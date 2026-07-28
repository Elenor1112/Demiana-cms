import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { requireUserDateTime } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, logSalesActivity, SALES_ACTIVITY, requireSalesModule,
} from "@/lib/sales";
import { proposalCreateSchema } from "@/lib/sales-schemas";
import type { ProposalStatus } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    const sp = req.nextUrl.searchParams;
    const leadId = sp.get("lead");
    const status = sp.getAll("status").filter(Boolean) as ProposalStatus[];

    const proposals = await db.proposal.findMany({
      where: {
        ...(visibility ? { lead: visibility } : {}),
        ...(leadId ? { leadId } : {}),
        ...(status.length ? { status: { in: status } } : {}),
      },
      include: {
        lead: { select: { id: true, code: true, companyName: true, stage: true } },
        preparedBy: userPick,
        events: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: userPick } },
        _count: { select: { attachments: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });

    return NextResponse.json({
      proposals: proposals.map((p) => ({ ...p, amount: p.amount ? Number(p.amount) : null })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const data = proposalCreateSchema.parse(await req.json());

    const lead = await db.lead.findFirst({
      where: { id: data.leadId, ...leadVisibilityFilter(user) },
      select: {
        id: true, code: true, companyName: true, ownerId: true, createdById: true, stage: true,
      },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");
    assertCanEditLead(user, lead, "Sales.ProposalManage");

    const latest = await db.proposal.findFirst({
      where: { leadId: lead.id },
      orderBy: { version: "desc" },
      select: { id: true, version: true, revisionCount: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const proposal = await db.proposal.create({
      data: {
        leadId: lead.id,
        version,
        title: data.title,
        summary: data.summary,
        amount: data.amount ?? null,
        currency: data.currency,
        preparedById: user.id,
        validUntil: data.validUntil ? requireUserDateTime(data.validUntil, "validUntil") : null,
        // A revision inherits the count from the version it supersedes, so
        // "how many times did we rework this deal" survives versioning.
        revisionCount: data.isRevision ? (latest?.revisionCount ?? 0) + 1 : 0,
        events: {
          create: {
            type: data.isRevision ? "REVISED" : "CREATED",
            actorId: user.id,
            note: data.isRevision ? `Revision of v${latest?.version}` : undefined,
          },
        },
      },
      include: {
        lead: { select: { id: true, code: true, companyName: true } },
        preparedBy: userPick,
        events: { orderBy: { createdAt: "desc" }, include: { actor: userPick } },
      },
    });

    // Drafting a proposal advances the pipeline on its own.
    if (["NEW", "CONTACTED", "QUALIFIED", "MEETING_SCHEDULED", "DISCOVERY"].includes(lead.stage)) {
      await db.lead.update({ where: { id: lead.id }, data: { stage: "PROPOSAL", probability: 60 } });
      await db.leadStageChange.create({
        data: { leadId: lead.id, fromStage: lead.stage, toStage: "PROPOSAL", actorId: user.id },
      });
    }

    await logSalesActivity({
      leadId: lead.id, actorId: user.id, verb: SALES_ACTIVITY.PROPOSAL_CREATED,
      summary: `${data.title} (v${version})`,
      meta: { proposalId: proposal.id, version },
    });

    await audit({
      actorId: user.id, action: "sales.proposal.create", entity: "proposal", entityId: proposal.id,
      newValue: { leadId: lead.id, version, title: data.title, amount: data.amount ?? null },
    });

    return NextResponse.json(
      { proposal: { ...proposal, amount: proposal.amount ? Number(proposal.amount) : null } },
      { status: 201 }
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}
