import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { requireUserDateTime } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, proposalEventUpdate, logSalesActivity,
  SALES_ACTIVITY, notifySales, requireSalesModule,
} from "@/lib/sales";
import { proposalPatchSchema, proposalEventSchema } from "@/lib/sales-schemas";
import type { SessionUser } from "@/lib/rbac";
import type { Prisma, ProposalEventType } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

async function loadProposal(user: SessionUser, id: string) {
  const proposal = await db.proposal.findFirst({
    // Proposals inherit the lead's visibility, like meetings.
    where: { id, lead: leadVisibilityFilter(user) },
    include: {
      lead: {
        select: {
          id: true, code: true, companyName: true, ownerId: true, createdById: true, stage: true,
        },
      },
      preparedBy: userPick,
      events: { orderBy: { createdAt: "desc" }, include: { actor: userPick } },
      attachments: {
        select: { id: true, name: true, mimeType: true, size: true, isVoiceNote: true, createdAt: true },
      },
    },
  });
  if (!proposal) throw new ApiError(404, "Proposal not found.");
  return proposal;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const proposal = await loadProposal(user, id);
    return NextResponse.json({
      proposal: { ...proposal, amount: proposal.amount ? Number(proposal.amount) : null },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const proposal = await loadProposal(user, id);
    assertCanEditLead(user, proposal.lead, "Sales.ProposalManage");

    const body = proposalPatchSchema.parse(await req.json());
    const data: Prisma.ProposalUpdateInput = {};
    for (const key of ["title", "summary", "currency", "rejectionReason"] as const) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[key] = body[key];
    }
    if (body.amount !== undefined) data.amount = body.amount ?? null;
    if (body.validUntil !== undefined) {
      data.validUntil = body.validUntil ? requireUserDateTime(body.validUntil, "validUntil") : null;
    }

    const updated = await db.proposal.update({ where: { id }, data, include: { preparedBy: userPick } });

    await audit({
      actorId: user.id, action: "sales.proposal.update", entity: "proposal", entityId: id,
      oldValue: { title: proposal.title, amount: proposal.amount ? Number(proposal.amount) : null },
      newValue: { title: updated.title, amount: updated.amount ? Number(updated.amount) : null },
    });

    return NextResponse.json({
      proposal: { ...updated, amount: updated.amount ? Number(updated.amount) : null },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Record a touchpoint (sent / opened / accepted / …).
 *
 * POST rather than PATCH because each call APPENDS to the event log; the
 * denormalized timestamps on Proposal are a consequence, derived by
 * proposalEventUpdate so the mapping lives in one place.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const proposal = await loadProposal(user, id);
    assertCanEditLead(user, proposal.lead, "Sales.ProposalManage");

    const { type, note } = proposalEventSchema.parse(await req.json());
    const now = new Date();

    const [, updated] = await db.$transaction([
      db.proposalEvent.create({
        data: { proposalId: id, type, actorId: user.id, note, createdAt: now },
      }),
      db.proposal.update({
        where: { id },
        data: proposalEventUpdate(type, proposal, now),
        include: { preparedBy: userPick },
      }),
    ]);

    // Accepting a proposal wins the deal; rejecting one sends it to negotiation
    // rather than straight to lost, since a rejected price is usually a
    // counter-offer, not the end of the conversation.
    if (type === "ACCEPTED" && proposal.lead.stage !== "WON") {
      await db.lead.update({
        where: { id: proposal.leadId },
        data: { stage: "WON", probability: 100, wonAt: now, nextFollowUpAt: null },
      });
      await db.leadStageChange.create({
        data: {
          leadId: proposal.leadId, fromStage: proposal.lead.stage, toStage: "WON",
          actorId: user.id, changedAt: now,
        },
      });
      await logSalesActivity({
        leadId: proposal.leadId, actorId: user.id, verb: SALES_ACTIVITY.WON,
        summary: `Proposal v${proposal.version} accepted`, at: now,
      });
    } else if (type === "REJECTED" && !["WON", "LOST"].includes(proposal.lead.stage)) {
      await db.lead.update({ where: { id: proposal.leadId }, data: { stage: "NEGOTIATION" } });
      await db.leadStageChange.create({
        data: {
          leadId: proposal.leadId, fromStage: proposal.lead.stage, toStage: "NEGOTIATION",
          actorId: user.id, changedAt: now,
        },
      });
    }

    const verbMap: Partial<Record<ProposalEventType, typeof SALES_ACTIVITY[keyof typeof SALES_ACTIVITY]>> = {
      SENT: SALES_ACTIVITY.PROPOSAL_SENT,
      OPENED: SALES_ACTIVITY.PROPOSAL_OPENED,
      ACCEPTED: SALES_ACTIVITY.PROPOSAL_ACCEPTED,
      REJECTED: SALES_ACTIVITY.PROPOSAL_REJECTED,
    };
    const verb = verbMap[type];
    if (verb) {
      await logSalesActivity({
        leadId: proposal.leadId, actorId: user.id, verb,
        summary: `${proposal.title} (v${proposal.version})`,
        meta: { proposalId: id, type }, at: now,
      });
    }

    await audit({
      actorId: user.id, action: `sales.proposal.${type.toLowerCase()}`, entity: "proposal", entityId: id,
      newValue: { type, leadId: proposal.leadId, version: proposal.version },
    });

    // The events worth interrupting someone for.
    if (type === "OPENED" || type === "ACCEPTED" || type === "REJECTED") {
      const label =
        type === "OPENED" ? "opened" : type === "ACCEPTED" ? "accepted" : "rejected";
      await notifySales({
        ownerId: proposal.lead.ownerId,
        excludeActorId: user.id,
        type: type === "ACCEPTED" ? "PROJECT_UPDATED" : "ANNOUNCEMENT",
        title: `Proposal ${label} — ${proposal.lead.companyName}`,
        body: `${proposal.title} (v${proposal.version}) was ${label}.`,
        link: `/sales/leads/${proposal.leadId}`,
        meta: { leadId: proposal.leadId, proposalId: id },
      });
    }

    const events = await db.proposalEvent.findMany({
      where: { proposalId: id },
      orderBy: { createdAt: "desc" },
      include: { actor: userPick },
    });

    return NextResponse.json({
      proposal: { ...updated, amount: updated.amount ? Number(updated.amount) : null },
      events,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const proposal = await loadProposal(user, id);
    assertCanEditLead(user, proposal.lead, "Sales.ProposalManage");

    await db.proposal.delete({ where: { id } });
    await audit({
      actorId: user.id, action: "sales.proposal.delete", entity: "proposal", entityId: id,
      oldValue: { leadId: proposal.leadId, version: proposal.version, title: proposal.title },
    });

    return NextResponse.json({ ok: true, message: "Proposal deleted" });
  } catch (e) {
    return toErrorResponse(e);
  }
}
