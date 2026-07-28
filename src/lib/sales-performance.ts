import "server-only";
import { db } from "./db";
import { companyMonthStart, monthLabel, totalValue, weightedValue, OPEN_STAGES } from "./sales";
import type { LeadStage, Prisma } from "@prisma/client";

/**
 * Salesperson performance metrics — one implementation, three consumers.
 *
 * The personal dashboard (a member's own numbers), the Team page (everyone,
 * side by side) and the lifetime performance report all need the same figures
 * over different populations and windows. Computing them here means "win rate"
 * cannot mean one thing on the dashboard and another in the report.
 *
 * Everything is DERIVED from the CRM tables on read — leads, meetings, briefs,
 * feedback, proposals, activities. Nothing is stored as a rollup, so the
 * numbers cannot go stale and there is no aggregate to rebuild after a
 * correction. The cost is paid with indexed counts, not table scans.
 */

/** Bound a metric set to one salesperson, and optionally to a time window. */
export type PerformanceWindow = {
  /** Restrict to leads owned by this user. Omit for agency-wide figures. */
  ownerId?: string;
  /** Only count records created/closed at or after this instant. */
  from?: Date;
  /** Exclusive upper bound. */
  to?: Date;
};

/**
 * The full metric set for one salesperson.
 *
 * Field names are shared with the API responses, so a chart reading
 * `winRate` on the dashboard and in the report is reading the same number.
 */
export type SalesPerformance = {
  // Volume
  totalLeads: number;
  activeLeads: number;
  qualifiedLeads: number;
  // Activity
  meetingsHeld: number;
  meetingsScheduled: number;
  discoveryMeetings: number;
  briefsCompleted: number;
  discoveryCompletionRate: number;
  feedbackSubmitted: number;
  followUpsDue: number;
  followUpsTotal: number;
  followUpCompletion: number;
  activities: number;
  // Commercial
  proposalsSent: number;
  proposalsAccepted: number;
  proposalAcceptanceRate: number;
  negotiationsStarted: number;
  dealsWon: number;
  dealsLost: number;
  winRate: number;
  pipelineValue: number;
  forecast: number;
  revenueClosed: number;
  avgDealValue: number;
  largestDeal: number;
  avgSalesCycleDays: number;
  // Work in progress
  discoveryPending: number;
  feedbackPending: number;
  proposalsWaiting: number;
  activeNegotiations: number;
};

/** Lead predicate for a window: owner plus an optional creation range. */
function leadWhere(w: PerformanceWindow, dateField: "createdAt" | "wonAt" | "lostAt" = "createdAt") {
  const where: Prisma.LeadWhereInput = {};
  if (w.ownerId) where.ownerId = w.ownerId;
  if (w.from || w.to) {
    where[dateField] = { ...(w.from ? { gte: w.from } : {}), ...(w.to ? { lt: w.to } : {}) };
  }
  return where;
}

/**
 * Compute every metric for one window.
 *
 * Issued as a single Promise.all so the round trips overlap; each query is an
 * indexed count or a narrow select rather than a full row fetch.
 */
export async function computePerformance(w: PerformanceWindow): Promise<SalesPerformance> {
  const now = new Date();
  const ownerFilter = w.ownerId ? { ownerId: w.ownerId } : {};
  // Meetings, briefs and proposals hang off a lead, so they are scoped through
  // it rather than carrying their own owner column.
  const viaLead = w.ownerId ? { lead: { ownerId: w.ownerId } } : {};

  const [
    totalLeads, activeLeads, qualifiedLeads,
    meetingsHeld, meetingsScheduled, discoveryMeetings,
    briefsCompleted, feedbackSubmitted,
    followUpsDue, followUpsTotal, activities,
    proposalsSent, proposalsAccepted, proposalsWaiting,
    negotiationsStarted, activeNegotiations,
    wonLeads, lostCount, openLeads,
    discoveryPending, feedbackPendingMeetings,
  ] = await Promise.all([
    db.lead.count({ where: leadWhere(w) }),
    db.lead.count({ where: { ...ownerFilter, stage: { in: OPEN_STAGES } } }),
    // "Ever qualified", from stage history — counting the CURRENT stage would
    // make the number fall as deals progress, which reads as regression.
    db.lead.count({
      where: { ...ownerFilter, stageChanges: { some: { toStage: "QUALIFIED" } } },
    }),
    db.salesMeeting.count({ where: { ...viaLead, status: "COMPLETED" } }),
    db.salesMeeting.count({ where: { ...viaLead, status: "SCHEDULED" } }),
    db.salesMeeting.count({
      where: { ...viaLead, type: "DISCOVERY_CALL", status: "COMPLETED" },
    }),
    db.discoveryBrief.count({ where: { ...viaLead, status: "SUBMITTED" } }),
    db.salesFeedback.count({ where: viaLead }),
    db.lead.count({
      where: { ...ownerFilter, stage: { in: OPEN_STAGES }, nextFollowUpAt: { lte: now } },
    }),
    db.lead.count({
      where: { ...ownerFilter, stage: { in: OPEN_STAGES }, nextFollowUpAt: { not: null } },
    }),
    w.ownerId
      ? db.salesActivity.count({
          where: {
            actorId: w.ownerId,
            ...(w.from || w.to
              ? { createdAt: { ...(w.from ? { gte: w.from } : {}), ...(w.to ? { lt: w.to } : {}) } }
              : {}),
          },
        })
      : db.salesActivity.count(),
    db.proposal.count({ where: { ...viaLead, sentAt: { not: null } } }),
    db.proposal.count({ where: { ...viaLead, status: "ACCEPTED" } }),
    db.proposal.count({
      where: { ...viaLead, status: { in: ["SENT", "VIEWED", "UNDER_REVISION"] } },
    }),
    db.lead.count({
      where: { ...ownerFilter, stageChanges: { some: { toStage: "NEGOTIATION" } } },
    }),
    db.lead.count({ where: { ...ownerFilter, stage: "NEGOTIATION" } }),
    // Values are needed, not just counts, for revenue and deal-size metrics.
    db.lead.findMany({
      where: { ...leadWhere(w, "wonAt"), stage: "WON" },
      select: { estimatedValue: true, wonAt: true, createdAt: true },
    }),
    db.lead.count({ where: { ...leadWhere(w, "lostAt"), stage: "LOST" } }),
    db.lead.findMany({
      where: { ...ownerFilter, stage: { in: OPEN_STAGES } },
      select: { estimatedValue: true, probability: true },
    }),
    // Work in progress: a lead past qualification with no submitted brief yet.
    db.lead.count({
      where: {
        ...ownerFilter,
        stage: { in: ["DISCOVERY", "PROPOSAL", "NEGOTIATION"] as LeadStage[] },
        briefs: { none: { status: "SUBMITTED" } },
      },
    }),
    // A completed meeting still missing its debrief.
    db.salesMeeting.count({
      where: { ...viaLead, status: { in: ["SCHEDULED", "COMPLETED"] }, feedback: { none: {} } },
    }),
  ]);

  const revenueClosed = Math.round(totalValue(wonLeads));
  const closed = wonLeads.length + lostCount;

  // Cycle time: creation → win, in days. Only won deals, since a lost deal's
  // duration measures how long it took to give up, not how long a sale takes.
  const cycles = wonLeads
    .filter((l) => l.wonAt)
    .map((l) => (l.wonAt!.getTime() - l.createdAt.getTime()) / 86_400_000)
    .filter((d) => d >= 0);

  const largestDeal = wonLeads.reduce(
    (max, l) => Math.max(max, Number(l.estimatedValue ?? 0)),
    0
  );

  return {
    totalLeads,
    activeLeads,
    qualifiedLeads,
    meetingsHeld,
    meetingsScheduled,
    discoveryMeetings,
    briefsCompleted,
    // Of the discovery calls actually held, how many produced a brief.
    discoveryCompletionRate: discoveryMeetings
      ? Math.round((briefsCompleted / discoveryMeetings) * 100)
      : 0,
    feedbackSubmitted,
    followUpsDue,
    followUpsTotal,
    followUpCompletion: followUpsTotal
      ? Math.round(((followUpsTotal - followUpsDue) / followUpsTotal) * 100)
      : 100,
    activities,
    proposalsSent,
    proposalsAccepted,
    proposalAcceptanceRate: proposalsSent
      ? Math.round((proposalsAccepted / proposalsSent) * 100)
      : 0,
    negotiationsStarted,
    activeNegotiations,
    dealsWon: wonLeads.length,
    dealsLost: lostCount,
    winRate: closed ? Math.round((wonLeads.length / closed) * 100) : 0,
    pipelineValue: Math.round(totalValue(openLeads)),
    forecast: Math.round(weightedValue(openLeads)),
    revenueClosed,
    avgDealValue: wonLeads.length ? Math.round(revenueClosed / wonLeads.length) : 0,
    largestDeal: Math.round(largestDeal),
    avgSalesCycleDays: cycles.length
      ? Math.round(cycles.reduce((s, d) => s + d, 0) / cycles.length)
      : 0,
    discoveryPending,
    feedbackPending: feedbackPendingMeetings,
    proposalsWaiting,
  };
}

/**
 * Month-by-month trend for one salesperson.
 *
 * Each month is three indexed counts plus one narrow select, run in parallel
 * per month — cheaper than pulling every lead and bucketing in memory once the
 * history grows past a few hundred rows.
 */
export async function monthlyTrend(
  ownerId: string | undefined,
  months: number,
  now: Date = new Date()
) {
  const ownerFilter = ownerId ? { ownerId } : {};
  const out: {
    month: string; created: number; won: number; lost: number; revenue: number;
  }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const start = companyMonthStart(-i, now);
    const end = companyMonthStart(-i + 1, now);
    const [created, wonRows, lost] = await Promise.all([
      db.lead.count({ where: { ...ownerFilter, createdAt: { gte: start, lt: end } } }),
      db.lead.findMany({
        where: { ...ownerFilter, wonAt: { gte: start, lt: end } },
        select: { estimatedValue: true },
      }),
      db.lead.count({ where: { ...ownerFilter, lostAt: { gte: start, lt: end } } }),
    ]);
    out.push({
      month: monthLabel(start),
      created,
      won: wonRows.length,
      lost,
      revenue: Math.round(totalValue(wonRows)),
    });
  }
  return out;
}

/**
 * Conversion funnel for one salesperson.
 *
 * Counts leads that have EVER reached each stage, read from LeadStageChange.
 * Using the current stage instead would empty the top of the funnel as deals
 * advance, which is the opposite of what a funnel is meant to show.
 */
export async function conversionFunnel(ownerId?: string) {
  const stages: LeadStage[] = ["NEW", "QUALIFIED", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON"];
  const ownerFilter = ownerId ? { ownerId } : {};
  return Promise.all(
    stages.map(async (stage) => ({
      stage,
      count: await db.lead.count({
        where: { ...ownerFilter, stageChanges: { some: { toStage: stage } } },
      }),
    }))
  );
}

/** Loss reasons for one salesperson, most frequent first. */
export async function lossReasons(ownerId?: string) {
  const rows = await db.lead.findMany({
    where: { ...(ownerId ? { ownerId } : {}), stage: "LOST" },
    select: { lostReason: true },
  });
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    const key = r.lostReason?.trim() || "Not specified";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Quarterly and yearly rollups, folded from a monthly series.
 *
 * Derived rather than re-queried: the monthly numbers are already exact, and
 * summing them is both cheaper and guaranteed consistent with the monthly chart
 * shown beside them.
 */
export function rollUpPeriods(
  monthly: { month: string; created: number; won: number; lost: number; revenue: number }[]
) {
  const quarterly: {
    period: string; created: number; won: number; lost: number; revenue: number;
  }[] = [];
  for (let i = 0; i < monthly.length; i += 3) {
    const chunk = monthly.slice(i, i + 3);
    if (!chunk.length) continue;
    quarterly.push({
      period: `${chunk[0].month}–${chunk[chunk.length - 1].month}`,
      created: chunk.reduce((s, m) => s + m.created, 0),
      won: chunk.reduce((s, m) => s + m.won, 0),
      lost: chunk.reduce((s, m) => s + m.lost, 0),
      revenue: chunk.reduce((s, m) => s + m.revenue, 0),
    });
  }
  const yearly = {
    period: "Last 12 months",
    created: monthly.reduce((s, m) => s + m.created, 0),
    won: monthly.reduce((s, m) => s + m.won, 0),
    lost: monthly.reduce((s, m) => s + m.lost, 0),
    revenue: monthly.reduce((s, m) => s + m.revenue, 0),
  };
  return { quarterly, yearly };
}
