import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import {
  requireSalesModule, companyDayStart, OPEN_STAGES,
} from "@/lib/sales";
import { computePerformance, monthlyTrend, conversionFunnel } from "@/lib/sales-performance";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * A salesperson's own dashboard.
 *
 * Every figure is scoped to the CALLER — there is no owner parameter, so this
 * endpoint cannot be pointed at a colleague. A manager wanting someone else's
 * numbers uses /api/sales/team or the lifetime report, both of which are gated
 * on Sales.ViewTeam.
 *
 * Metrics come from computePerformance, the same function the team page and
 * the lifetime report use, so "win rate" means one thing everywhere.
 */
export async function GET() {
  try {
    const user = requireSalesModule(await requireUser());
    const now = new Date();
    const todayStart = companyDayStart(0, now);
    const tomorrowStart = companyDayStart(1, now);

    const mine = { ownerId: user.id };

    const [
      performance, trend, funnel,
      meetingsToday, upcomingMeetings, overdueFollowUps,
      assignedLeads, discoveryPendingLeads, feedbackPendingMeetings,
      proposalsWaiting, negotiations, recentActivities,
    ] = await Promise.all([
      computePerformance({ ownerId: user.id }),
      monthlyTrend(user.id, 6, now),
      conversionFunnel(user.id),

      // ── Today's schedule ──
      db.salesMeeting.findMany({
        where: {
          lead: mine,
          scheduledAt: { gte: todayStart, lt: tomorrowStart },
          status: "SCHEDULED",
        },
        include: {
          lead: { select: { id: true, code: true, companyName: true } },
          attendees: { include: { user: userPick } },
        },
        orderBy: { scheduledAt: "asc" },
      }),
      db.salesMeeting.findMany({
        where: { lead: mine, scheduledAt: { gte: tomorrowStart }, status: "SCHEDULED" },
        include: { lead: { select: { id: true, code: true, companyName: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      db.lead.findMany({
        where: { ...mine, stage: { in: OPEN_STAGES }, nextFollowUpAt: { lte: now } },
        select: {
          id: true, code: true, companyName: true, stage: true, priority: true,
          nextFollowUpAt: true,
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 10,
      }),

      // ── My pipeline ──
      db.lead.findMany({
        where: { ...mine, stage: { in: OPEN_STAGES } },
        select: {
          id: true, code: true, companyName: true, stage: true, priority: true,
          estimatedValue: true, probability: true, expectedCloseDate: true,
          nextFollowUpAt: true,
        },
        orderBy: [{ priority: "desc" }, { expectedCloseDate: "asc" }],
        take: 12,
      }),
      // Past qualification but no submitted brief — the form still owed.
      db.lead.findMany({
        where: {
          ...mine,
          stage: { in: ["DISCOVERY", "PROPOSAL", "NEGOTIATION"] },
          briefs: { none: { status: "SUBMITTED" } },
        },
        select: { id: true, code: true, companyName: true, stage: true },
        take: 10,
      }),
      // Meetings with no debrief — the feedback form still owed. A SCHEDULED
      // meeting is included because it cannot be completed until this exists.
      db.salesMeeting.findMany({
        where: { lead: mine, feedback: { none: {} }, status: { in: ["SCHEDULED", "COMPLETED"] } },
        include: { lead: { select: { id: true, code: true, companyName: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
      db.proposal.findMany({
        where: { lead: mine, status: { in: ["SENT", "VIEWED", "UNDER_REVISION"] } },
        include: { lead: { select: { id: true, code: true, companyName: true } } },
        orderBy: { sentAt: "desc" },
        take: 10,
      }),
      db.lead.findMany({
        where: { ...mine, stage: "NEGOTIATION" },
        select: {
          id: true, code: true, companyName: true, estimatedValue: true,
          probability: true, expectedCloseDate: true,
        },
        orderBy: { expectedCloseDate: "asc" },
        take: 10,
      }),

      // ── Recent activity: this person's own actions only ──
      db.salesActivity.findMany({
        where: { actorId: user.id },
        include: { lead: { select: { id: true, code: true, companyName: true, stage: true } } },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    return NextResponse.json({
      performance,
      charts: { trend, funnel },
      schedule: {
        meetingsToday,
        upcomingMeetings,
        overdueFollowUps,
      },
      pipeline: {
        // Decimal does not survive JSON.stringify as a number.
        assignedLeads: assignedLeads.map((l) => ({
          ...l,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
        })),
        discoveryPending: discoveryPendingLeads,
        feedbackPending: feedbackPendingMeetings,
        proposalsWaiting: proposalsWaiting.map((p) => ({
          ...p,
          amount: p.amount ? Number(p.amount) : null,
        })),
        negotiations: negotiations.map((l) => ({
          ...l,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
        })),
      },
      recentActivities,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
