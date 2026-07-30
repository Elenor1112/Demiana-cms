import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { keepOrRequireFuture } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, stageTransition, logSalesActivity,
  SALES_ACTIVITY, notifySales, requireSalesModule, syncWonLeadToClient,
} from "@/lib/sales";
import { leadPatchSchema } from "@/lib/sales-schemas";
import { LEAD_STAGE_META } from "@/lib/sales-constants";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * Attachment listings never include the blob — that split is the whole reason
 * SalesAttachmentFile is a separate table. Declared as a const rather than a
 * function so Prisma infers the literal type instead of widening it.
 */
const attachmentFields = {
  select: {
    id: true, name: true, mimeType: true, size: true, isVoiceNote: true, createdAt: true,
    uploadedBy: userPick,
  },
} satisfies { select: Prisma.SalesAttachmentSelect };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const visibility = leadVisibilityFilter(user);

    const lead = await db.lead.findFirst({
      where: { id, ...visibility },
      include: {
        owner: userPick,
        createdBy: userPick,
        convertedClient: { select: { id: true, company: true, status: true } },
        meetings: {
          orderBy: { scheduledAt: "desc" },
          include: {
            organizer: userPick,
            attendees: { include: { user: userPick } },
            requirements: { orderBy: { order: "asc" } },
            _count: { select: { feedback: true, attachments: true } },
          },
        },
        briefs: {
          orderBy: { createdAt: "desc" },
          include: { submittedBy: userPick, attachments: attachmentFields },
        },
        feedback: {
          orderBy: { createdAt: "desc" },
          include: {
            author: userPick,
            meeting: { select: { id: true, title: true, scheduledAt: true } },
            attachments: attachmentFields,
          },
        },
        proposals: {
          orderBy: { version: "desc" },
          include: {
            preparedBy: userPick,
            events: { orderBy: { createdAt: "desc" }, include: { actor: userPick } },
            attachments: attachmentFields,
          },
        },
        comments: { orderBy: { createdAt: "desc" }, include: { author: userPick } },
        attachments: { orderBy: { createdAt: "desc" }, ...attachmentFields },
        activities: { orderBy: { createdAt: "desc" }, take: 200 },
        stageChanges: { orderBy: { changedAt: "desc" } },
        ownerHistory: {
          orderBy: { assignedAt: "desc" },
          include: { owner: userPick, assignedBy: userPick },
        },
      },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");

    // Activity rows store only actorId (they may be system-generated), so the
    // actors are resolved in one query rather than through a relation that
    // would force a join on every write path.
    const actorIds = [...new Set(lead.activities.map((a) => a.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, ...userPick })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    // Tasks created from this lead's ideas, so the Tasks tab has content.
    const ideas = await db.salesIdea.findMany({
      where: { leadId: id },
      select: { id: true, title: true, status: true, convertedTaskId: true, convertedProjectId: true },
    });
    const taskIds = ideas.map((i) => i.convertedTaskId).filter(Boolean) as string[];
    const tasks = taskIds.length
      ? await db.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, code: true, title: true, status: true, priority: true, deadline: true },
        })
      : [];

    return NextResponse.json({
      lead: {
        ...lead,
        estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
        proposals: lead.proposals.map((p) => ({ ...p, amount: p.amount ? Number(p.amount) : null })),
        activities: lead.activities.map((a) => ({
          ...a,
          actor: a.actorId ? (actorMap.get(a.actorId) ?? null) : null,
        })),
        ideas,
        tasks,
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const visibility = leadVisibilityFilter(user);

    const existing = await db.lead.findFirst({
      where: { id, ...visibility },
      select: {
        id: true, code: true, companyName: true, stage: true, ownerId: true,
        createdById: true, probability: true, wonAt: true, lostAt: true,
        estimatedValue: true, convertedClientId: true,
        // Needed to tell "moved the date" from "resubmitted the same date".
        expectedCloseDate: true, nextFollowUpAt: true,
      },
    });
    if (!existing) throw new ApiError(404, "Lead not found.");

    const body = leadPatchSchema.parse(await req.json());
    const now = new Date();

    // A stage move is a different permission from an ordinary field edit, so it
    // is authorised separately rather than folded into Sales.LeadEdit.
    const stageChanging = body.stage !== undefined && body.stage !== existing.stage;
    assertCanEditLead(user, existing, stageChanging ? "Sales.ChangeStage" : "Sales.LeadEdit");

    const ownerChanging = body.ownerId !== undefined && body.ownerId !== existing.ownerId;
    if (ownerChanging && !can(user, "Sales.Assign")) {
      throw new ApiError(403, "Missing permission: Sales.Assign");
    }
    if (ownerChanging && body.ownerId) {
      const owner = await db.user.findFirst({
        where: { id: body.ownerId, status: "ACTIVE" }, select: { id: true },
      });
      if (!owner) throw new ApiError(400, "The selected owner does not exist.");
    }

    const data: Prisma.LeadUpdateInput = {};
    // Scalar fields copy across only when present, so a partial patch never
    // nulls a field the client did not mention.
    const scalar = [
      "companyName", "brandName", "contactPerson", "jobTitle", "phone", "whatsapp", "email",
      "website", "industry", "country", "city", "source", "priority", "notes",
      "lostReason",
    ] as const;
    for (const key of scalar) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[key] = body[key];
    }
    if (body.companySize !== undefined) data.companySize = body.companySize ?? null;
    if (body.tags !== undefined) data.tags = body.tags;
    if (body.socialLinks !== undefined) data.socialLinks = body.socialLinks as object;
    if (body.estimatedValue !== undefined) data.estimatedValue = body.estimatedValue ?? null;
    // Scheduling dates may not be moved into the past, but re-sending the value
    // already stored is allowed — a lead whose close date has slipped by must
    // still be editable in every other respect.
    if (body.expectedCloseDate !== undefined) {
      data.expectedCloseDate = body.expectedCloseDate
        ? keepOrRequireFuture(body.expectedCloseDate, existing.expectedCloseDate, "expectedCloseDate")
        : null;
    }
    if (body.nextFollowUpAt !== undefined) {
      data.nextFollowUpAt = body.nextFollowUpAt
        ? keepOrRequireFuture(body.nextFollowUpAt, existing.nextFollowUpAt, "nextFollowUpAt")
        : null;
    }
    if (body.probability !== undefined && !stageChanging) data.probability = body.probability;
    if (ownerChanging) data.owner = body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true };

    // The transition helper owns wonAt/lostAt and the probability default, so
    // those invariants live in one place rather than in each caller.
    if (stageChanging) {
      Object.assign(
        data,
        stageTransition(existing, body.stage!, {
          lostReason: body.lostReason,
          probability: body.probability,
        }, now)
      );
    }

    const lead = await db.lead.update({
      where: { id },
      data,
      select: { id: true, code: true, companyName: true, stage: true, ownerId: true, probability: true },
    });

    if (stageChanging) {
      await db.leadStageChange.create({
        data: { leadId: id, fromStage: existing.stage, toStage: body.stage!, actorId: user.id, changedAt: now },
      });
      const verb =
        body.stage === "WON" ? SALES_ACTIVITY.WON
        : body.stage === "LOST" ? SALES_ACTIVITY.LOST
        : SALES_ACTIVITY.STAGE_CHANGED;
      await logSalesActivity({
        leadId: id, actorId: user.id, verb,
        summary: `${LEAD_STAGE_META[existing.stage].label} → ${LEAD_STAGE_META[body.stage!].label}`,
        meta: { from: existing.stage, to: body.stage },
        at: now,
      });

      // Winning a deal creates (or refreshes) the client immediately, rather
      // than waiting for someone to open the Convert dialog. Convert still
      // exists — it adds the project and the manager nominations — but the
      // client record now always exists the moment the deal is marked Won.
      //
      // Done in its own transaction so a failure here cannot roll back the
      // stage change that has already been recorded and announced; the sync is
      // idempotent, so a later Convert simply updates the same row.
      if (body.stage === "WON") {
        try {
          const { client, created } = await db.$transaction((tx) =>
            syncWonLeadToClient(tx, id)
          );
          await logSalesActivity({
            leadId: id,
            actorId: user.id,
            verb: SALES_ACTIVITY.CLIENT_CONVERTED,
            summary: created
              ? `Client created: ${client.company}`
              : `Client updated: ${client.company}`,
            meta: { clientId: client.id, auto: true, created },
          });
          await audit({
            actorId: user.id,
            action: created ? "client.create" : "client.update",
            entity: "client",
            entityId: client.id,
            newValue: { company: client.company, fromLead: existing.code, auto: true },
          });
        } catch (e) {
          // A sync failure must not fail the stage change: the deal IS won, and
          // the client can be reconciled by re-saving or via Convert.
          console.error("won-lead client sync failed", e);
        }
      }

      if (body.stage === "WON" || body.stage === "LOST") {
        const won = body.stage === "WON";
        await notifySales({
          ownerId: lead.ownerId,
          excludeActorId: user.id,
          type: won ? "PROJECT_UPDATED" : "ANNOUNCEMENT",
          title: won ? `Deal won — ${lead.companyName}` : `Deal lost — ${lead.companyName}`,
          body: won
            ? `${user.firstName} ${user.lastName} marked ${lead.companyName} (${lead.code}) as won.`
            : `${lead.companyName} (${lead.code}) was marked lost${body.lostReason ? `: ${body.lostReason}` : "."}`,
          link: `/sales/leads/${id}`,
          meta: { leadId: id },
        });
      }
    }

    if (ownerChanging) {
      // Close the open history row before opening the next, so the timeline
      // never shows two owners at once — the WorkerAssignment pattern.
      await db.leadOwnerAssignment.updateMany({
        where: { leadId: id, unassignedAt: null },
        data: { unassignedAt: now },
      });
      await db.leadOwnerAssignment.create({
        data: { leadId: id, ownerId: body.ownerId ?? null, assignedById: user.id, assignedAt: now },
      });
      await logSalesActivity({
        leadId: id, actorId: user.id, verb: SALES_ACTIVITY.LEAD_ASSIGNED,
        meta: { from: existing.ownerId, to: body.ownerId ?? null }, at: now,
      });
      if (body.ownerId && body.ownerId !== user.id) {
        await notifySales({
          ownerId: body.ownerId, excludeActorId: user.id, includeManagers: false,
          type: "TASK_ASSIGNED",
          title: "New lead assigned",
          body: `${user.firstName} ${user.lastName} assigned ${lead.companyName} (${lead.code}) to you.`,
          link: `/sales/leads/${id}`,
          meta: { leadId: id },
        });
      }
    }

    if (!stageChanging && !ownerChanging) {
      await logSalesActivity({ leadId: id, actorId: user.id, verb: SALES_ACTIVITY.LEAD_UPDATED, at: now });
    }

    await audit({
      actorId: user.id, action: "sales.lead.update", entity: "lead", entityId: id,
      oldValue: { stage: existing.stage, ownerId: existing.ownerId, probability: existing.probability },
      newValue: { stage: lead.stage, ownerId: lead.ownerId, probability: lead.probability },
    });

    return NextResponse.json({ lead });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    if (!can(user, "Sales.LeadDelete")) {
      throw new ApiError(403, "Missing permission: Sales.LeadDelete");
    }

    const lead = await db.lead.findFirst({
      where: { id, ...leadVisibilityFilter(user) },
      select: { id: true, code: true, companyName: true, convertedClientId: true },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");
    // A converted lead is the provenance record for a live client, so deleting
    // it would orphan that history. Refuse rather than cascade.
    if (lead.convertedClientId) {
      throw new ApiError(
        409,
        "This lead has been converted to a client and cannot be deleted."
      );
    }

    await db.lead.delete({ where: { id } });
    await audit({
      actorId: user.id, action: "sales.lead.delete", entity: "lead", entityId: id,
      oldValue: { code: lead.code, companyName: lead.companyName },
    });

    return NextResponse.json({ ok: true, message: `${lead.companyName} deleted` });
  } catch (e) {
    return toErrorResponse(e);
  }
}
