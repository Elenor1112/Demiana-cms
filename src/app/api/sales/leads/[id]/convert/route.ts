import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { requireUserDateTime } from "@/lib/timezone";
import { leadVisibilityFilter, logSalesActivity, SALES_ACTIVITY, notifySales, requireSalesModule } from "@/lib/sales";
import { notifyMany } from "@/lib/notify";
import { convertSchema } from "@/lib/sales-schemas";

/**
 * Convert a won lead into a Client + Project.
 *
 * The whole point is that nothing is re-entered by hand. The lead's own fields
 * seed the client; the discovery brief, feedback, proposals, attachments and
 * timeline are NOT copied — they stay attached to the lead, which is now linked
 * to the client via Lead.convertedClientId. That link is what preserves the
 * history, and it means a later correction to the brief is still visible from
 * the client rather than diverging from a stale copy.
 *
 * Everything happens in one transaction: a half-converted lead (client created,
 * link not written) would be re-convertible and would duplicate the client.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;

    if (!can(user, "Sales.Convert")) {
      throw new ApiError(403, "Missing permission: Sales.Convert");
    }

    const lead = await db.lead.findFirst({
      where: { id, ...leadVisibilityFilter(user) },
      select: {
        id: true, code: true, companyName: true, brandName: true, contactPerson: true,
        email: true, phone: true, industry: true, notes: true, stage: true,
        ownerId: true, estimatedValue: true, convertedClientId: true,
      },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");

    if (lead.stage !== "WON") {
      throw new ApiError(409, "Only a lead marked Won can be converted to a client.");
    }
    if (lead.convertedClientId) {
      throw new ApiError(409, "This lead has already been converted to a client.");
    }

    const body = convertSchema.parse(await req.json().catch(() => ({})));

    // Validate the nominated people up front so the transaction cannot fail
    // halfway on a bad id.
    for (const [label, userId] of [
      ["account manager", body.accountManagerId],
      ["project manager", body.projectManagerId],
    ] as const) {
      if (!userId) continue;
      const exists = await db.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true } });
      if (!exists) throw new ApiError(400, `The selected ${label} does not exist.`);
    }

    const now = new Date();
    const clientName = body.clientName || lead.companyName;
    const projectName = body.projectName || `${lead.brandName || lead.companyName} — Onboarding`;

    const result = await db.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          company: clientName,
          contactPerson: lead.contactPerson,
          email: lead.email,
          phone: lead.phone,
          industry: lead.industry,
          status: "ACTIVE",
          notes: lead.notes,
          accountManagerId: body.accountManagerId ?? null,
        },
      });

      const project = await tx.project.create({
        data: {
          name: projectName,
          description: `Created from lead ${lead.code} (${lead.companyName}).`,
          status: "PLANNING",
          industry: lead.industry,
          clientId: client.id,
          leadId: body.projectManagerId ?? null,
          // The deal value becomes the opening project budget when no explicit
          // budget is given — the number was already agreed during the sale.
          budget: body.budget ?? lead.estimatedValue ?? null,
          startDate: body.startDate ? requireUserDateTime(body.startDate, "startDate") : null,
          deadline: body.deadline ? requireUserDateTime(body.deadline, "deadline") : null,
          members: {
            create: [
              ...(body.projectManagerId
                ? [{ userId: body.projectManagerId, role: "manager" }]
                : []),
              ...(body.accountManagerId && body.accountManagerId !== body.projectManagerId
                ? [{ userId: body.accountManagerId, role: "account" }]
                : []),
            ],
          },
        },
      });

      // Writing the link inside the transaction is what makes the conversion
      // idempotent: convertedClientId is @unique, so a concurrent second call
      // fails here rather than creating a second client.
      const updatedLead = await tx.lead.update({
        where: { id: lead.id },
        data: { convertedClientId: client.id, convertedAt: now, nextFollowUpAt: null },
        select: { id: true, code: true, companyName: true, ownerId: true },
      });

      return { client, project, lead: updatedLead };
    });

    await logSalesActivity({
      leadId: lead.id,
      actorId: user.id,
      verb: SALES_ACTIVITY.CLIENT_CONVERTED,
      summary: `Converted to client ${result.client.company}`,
      meta: { clientId: result.client.id, projectId: result.project.id },
      at: now,
    });

    await audit({
      actorId: user.id, action: "sales.lead.convert", entity: "lead", entityId: lead.id,
      oldValue: { stage: lead.stage, convertedClientId: null },
      newValue: {
        clientId: result.client.id, projectId: result.project.id,
        accountManagerId: body.accountManagerId ?? null,
        projectManagerId: body.projectManagerId ?? null,
      },
    });
    // Two more audit rows so the new records are traceable from their own
    // entity timelines, not only from the lead's.
    await audit({
      actorId: user.id, action: "client.create", entity: "client", entityId: result.client.id,
      newValue: { company: result.client.company, fromLead: lead.code },
    });
    await audit({
      actorId: user.id, action: "project.create", entity: "project", entityId: result.project.id,
      newValue: { name: result.project.name, clientId: result.client.id, fromLead: lead.code },
    });

    await notifySales({
      ownerId: lead.ownerId,
      excludeActorId: user.id,
      type: "PROJECT_UPDATED",
      title: "Lead converted to client",
      body: `${lead.companyName} (${lead.code}) is now an active client with the project "${result.project.name}".`,
      link: `/projects/${result.project.id}`,
      meta: { leadId: lead.id, clientId: result.client.id, projectId: result.project.id },
    });

    // The people picking the account up are told directly — this is the
    // handover. Sent with notifyMany rather than notifySales because the
    // recipients are an explicit list, not the owner-plus-managers fan-out.
    const handover = [body.accountManagerId, body.projectManagerId]
      .filter((x): x is string => Boolean(x) && x !== user.id);
    if (handover.length) {
      await notifyMany(handover, {
        type: "PROJECT_UPDATED",
        title: `You have been assigned to ${result.client.company}`,
        body: `${lead.companyName} has been converted from a lead. Project: ${result.project.name}.`,
        link: `/projects/${result.project.id}`,
        meta: { clientId: result.client.id, projectId: result.project.id },
      });
    }

    return NextResponse.json(
      { client: result.client, project: result.project, lead: result.lead },
      { status: 201 }
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
