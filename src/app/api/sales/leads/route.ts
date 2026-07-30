import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { requireFutureDateTime } from "@/lib/timezone";
import {
  leadVisibilityFilter, nextLeadCode, logSalesActivity,
  SALES_ACTIVITY, notifySales, requireSalesModule, OPEN_STAGES,
} from "@/lib/sales";
import { leadCreateSchema } from "@/lib/sales-schemas";
import type { LeadStage, Prisma } from "@prisma/client";

/** Fields every lead list needs, kept in one place so list shapes stay in sync. */
const listSelect = {
  id: true, code: true, companyName: true, brandName: true, contactPerson: true,
  jobTitle: true, email: true, phone: true, website: true, industry: true,
  city: true, country: true, stage: true, priority: true, source: true,
  estimatedValue: true, probability: true, expectedCloseDate: true,
  nextFollowUpAt: true, lastActivityAt: true, tags: true, wonAt: true, lostAt: true,
  convertedClientId: true, createdAt: true,
  owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  _count: { select: { meetings: true, proposals: true, briefs: true, feedback: true } },
} satisfies Prisma.LeadSelect;

export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    // Throws 403 for users with no sales access at all.
    const visibility = leadVisibilityFilter(user);

    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const stages = sp.getAll("stage").filter(Boolean) as LeadStage[];
    const owner = sp.get("owner");
    const priority = sp.get("priority");
    const source = sp.get("source");
    const group = sp.get("group"); // open | closed
    const tag = sp.get("tag");
    const mine = sp.get("mine");

    // Scoping predicates go into AND so a `q` search cannot clobber the
    // visibility OR — the same composition rule the tasks route uses.
    const and: Prisma.LeadWhereInput[] = [];
    if (visibility) and.push(visibility);
    if (mine) and.push({ ownerId: user.id });
    if (q) {
      and.push({
        OR: [
          { companyName: { contains: q, mode: "insensitive" } },
          { brandName: { contains: q, mode: "insensitive" } },
          { code: { contains: q, mode: "insensitive" } },
          { contactPerson: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { industry: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    // Imported rather than re-listed: a stage added to (or reordered in) the
    // funnel must not silently fall out of this filter.
    const openStages: LeadStage[] = OPEN_STAGES;

    const where: Prisma.LeadWhereInput = {
      ...(and.length ? { AND: and } : {}),
      ...(stages.length ? { stage: { in: stages } } : {}),
      ...(group === "open" ? { stage: { in: openStages } } : {}),
      ...(group === "closed" ? { stage: { in: ["WON", "LOST", "DORMANT"] as LeadStage[] } } : {}),
      ...(owner ? { ownerId: owner } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(source ? { source: source as never } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
    };

    const leads = await db.lead.findMany({
      where,
      select: listSelect,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });

    return NextResponse.json({
      // Decimal does not survive JSON.stringify as a number, so it is converted
      // once here rather than in every consumer.
      leads: leads.map((l) => ({ ...l, estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("Sales.LeadCreate");
    const data = leadCreateSchema.parse(await req.json());

    // An owner is mandatory at intake (see leadCreateSchema), so there is no
    // unassigned case here — only the question of WHO may be named. Handing a
    // lead to someone else needs Sales.Assign; without it you may only create
    // leads you will work yourself.
    let ownerId = data.ownerId;
    if (ownerId !== user.id) {
      if (!can(user, "Sales.Assign")) {
        throw new ApiError(403, "You cannot assign leads to other people.");
      }
      const owner = await db.user.findFirst({
        where: { id: ownerId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!owner) throw new ApiError(400, "The selected owner does not exist.");
      ownerId = owner.id;
    }

    const code = await nextLeadCode();
    const now = new Date();

    const lead = await db.lead.create({
      data: {
        code,
        companyName: data.companyName,
        brandName: data.brandName,
        contactPerson: data.contactPerson,
        jobTitle: data.jobTitle,
        phone: data.phone,
        whatsapp: data.whatsapp,
        email: data.email,
        website: data.website,
        industry: data.industry,
        companySize: data.companySize,
        country: data.country,
        city: data.city,
        source: data.source,
        priority: data.priority,
        stage: data.stage,
        ownerId,
        createdById: user.id,
        tags: data.tags,
        notes: data.notes,
        socialLinks: data.socialLinks as object | undefined,
        estimatedValue: data.estimatedValue,
        probability: data.probability,
        expectedCloseDate: requireFutureDateTime(data.expectedCloseDate, "expectedCloseDate"),
        nextFollowUpAt: data.nextFollowUpAt
          ? requireFutureDateTime(data.nextFollowUpAt, "nextFollowUpAt")
          : null,
        lastActivityAt: now,
        // The opening row of the stage history, so time-in-stage is measurable
        // from creation rather than from the first move.
        stageChanges: { create: { toStage: data.stage, actorId: user.id, changedAt: now } },
        ownerHistory: { create: { ownerId, assignedById: user.id, assignedAt: now } },
      },
      select: { id: true, code: true, companyName: true, ownerId: true },
    });

    await logSalesActivity({
      leadId: lead.id,
      actorId: user.id,
      verb: SALES_ACTIVITY.LEAD_CREATED,
      summary: `${lead.companyName} added to the pipeline`,
      at: now,
    });

    await audit({
      actorId: user.id, action: "sales.lead.create", entity: "lead", entityId: lead.id,
      newValue: { code, companyName: lead.companyName, ownerId: lead.ownerId, stage: data.stage },
    });

    if (lead.ownerId && lead.ownerId !== user.id) {
      await logSalesActivity({
        leadId: lead.id,
        actorId: user.id,
        verb: SALES_ACTIVITY.LEAD_ASSIGNED,
        meta: { ownerId: lead.ownerId },
      });
      await notifySales({
        ownerId: lead.ownerId,
        excludeActorId: user.id,
        includeManagers: false,
        type: "TASK_ASSIGNED",
        title: "New lead assigned",
        body: `${user.firstName} ${user.lastName} assigned ${lead.companyName} (${code}) to you.`,
        link: `/sales/leads/${lead.id}`,
        meta: { leadId: lead.id },
      });
    }

    return NextResponse.json({ lead }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
