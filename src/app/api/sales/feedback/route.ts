import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { requireUserDateTime, requireFutureDateTime } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, scoreOpportunity, logSalesActivity,
  SALES_ACTIVITY, notifySales, requireSalesModule,
} from "@/lib/sales";
import { feedbackSchema } from "@/lib/sales-schemas";
import { TEMPERATURE_META } from "@/lib/sales-constants";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    const sp = req.nextUrl.searchParams;
    const leadId = sp.get("lead");
    const temperature = sp.get("temperature");

    const feedback = await db.salesFeedback.findMany({
      where: {
        ...(visibility ? { lead: visibility } : {}),
        ...(leadId ? { leadId } : {}),
        ...(temperature ? { temperature: temperature as never } : {}),
      },
      include: {
        lead: { select: { id: true, code: true, companyName: true, stage: true } },
        author: userPick,
        meeting: { select: { id: true, title: true, scheduledAt: true } },
        attachments: {
          select: { id: true, name: true, mimeType: true, size: true, isVoiceNote: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    return NextResponse.json({ feedback });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const data = feedbackSchema.parse(await req.json());

    const lead = await db.lead.findFirst({
      where: { id: data.leadId, ...leadVisibilityFilter(user) },
      select: {
        id: true, code: true, companyName: true, ownerId: true, createdById: true,
        stage: true, probability: true,
      },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");
    assertCanEditLead(user, lead, "Sales.FeedbackSubmit");

    // A meeting, when given, must belong to this lead — otherwise feedback on
    // one deal could unlock completion of another deal's meeting.
    if (data.meetingId) {
      const meeting = await db.salesMeeting.findFirst({
        where: { id: data.meetingId, leadId: lead.id },
        select: { id: true },
      });
      if (!meeting) throw new ApiError(400, "That meeting does not belong to this lead.");
    }

    // The score is DERIVED here, never accepted from the client — that is what
    // makes it comparable across salespeople.
    const { score, temperature } = scoreOpportunity(data);

    const feedback = await db.salesFeedback.create({
      data: {
        leadId: lead.id,
        meetingId: data.meetingId || null,
        authorId: user.id,
        meetingDate: data.meetingDate ? requireUserDateTime(data.meetingDate, "meetingDate") : null,
        meetingType: data.meetingType ?? null,
        stage: data.stage ?? lead.stage,
        budgetFit: data.budgetFit ?? null,
        decisionMakerPresent: data.decisionMakerPresent,
        clientUrgency: data.clientUrgency ?? null,
        engagementLevel: data.engagementLevel ?? null,
        meetingOutcome: data.meetingOutcome ?? null,
        followUpCommitment: data.followUpCommitment,
        businessFit: data.businessFit ?? null,
        opportunityStrength: data.opportunityStrength ?? null,
        opportunityScore: score,
        temperature,
        closingProbability: data.closingProbability ?? null,
        decisionTimeline: data.decisionTimeline,
        finalDecisionMaker: data.finalDecisionMaker,
        clientPersonality: data.clientPersonality,
        objections: data.objections,
        buyingSignals: data.buyingSignals,
        operationalRisks: data.operationalRisks,
        proposalRecommendations: data.proposalRecommendations,
        servicesRecommended: data.servicesRecommended,
        nextAction: data.nextAction,
        nextMeetingDate: data.nextMeetingDate
          ? requireFutureDateTime(data.nextMeetingDate, "nextMeetingDate") : null,
        internalNotes: data.internalNotes,
      },
      include: { author: userPick, meeting: { select: { id: true, title: true } } },
    });

    // The salesperson's closing estimate becomes the lead's probability, and
    // the next meeting date becomes the follow-up the dashboard chases.
    const leadUpdate: Prisma.LeadUpdateInput = {};
    if (data.closingProbability !== null && data.closingProbability !== undefined) {
      leadUpdate.probability = data.closingProbability;
    }
    if (feedback.nextMeetingDate) leadUpdate.nextFollowUpAt = feedback.nextMeetingDate;
    if (Object.keys(leadUpdate).length) {
      await db.lead.update({ where: { id: lead.id }, data: leadUpdate });
    }

    await logSalesActivity({
      leadId: lead.id, actorId: user.id, verb: SALES_ACTIVITY.FEEDBACK_SUBMITTED,
      summary: `Feedback submitted — ${TEMPERATURE_META[temperature].label} (${score}/100)`,
      meta: { feedbackId: feedback.id, score, temperature },
    });

    await audit({
      actorId: user.id, action: "sales.feedback.create", entity: "salesFeedback", entityId: feedback.id,
      newValue: { leadId: lead.id, score, temperature, meetingId: data.meetingId ?? null },
    });

    await notifySales({
      ownerId: lead.ownerId, excludeActorId: user.id,
      type: "PROJECT_UPDATED",
      title: `Sales feedback — ${lead.companyName}`,
      body: `${user.firstName} ${user.lastName} scored this opportunity ${score}/100 (${TEMPERATURE_META[temperature].label}).`,
      link: `/sales/leads/${lead.id}`,
      meta: { leadId: lead.id, feedbackId: feedback.id },
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
