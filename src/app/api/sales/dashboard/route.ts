import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import {
  leadVisibilityFilter, companyDayStart, companyMonthStart, monthLabel,
  weightedValue, totalValue, requireSalesModule, OPEN_STAGES,
} from "@/lib/sales";
import type { LeadStage, Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * Everything the sales dashboard renders, in one request.
 *
 * Scoped by leadVisibilityFilter, so a sales member's dashboard shows their own
 * numbers and a manager's shows the whole pipeline — same endpoint, no
 * client-side filtering of data the caller should not have received.
 */
export async function GET() {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    // Every lead query starts from the caller's scope; `scoped` composes it with
    // the query's own predicate so neither can clobber the other.
    const scoped = (where: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput =>
      visibility ? { AND: [visibility, where] } : where;

    const now = new Date();
    const todayStart = companyDayStart(0, now);
    const tomorrowStart = companyDayStart(1, now);
    const monthStart = companyMonthStart(0, now);

    const [
      newLeads, qualifiedLeads, meetingsToday, followUpsDue, proposalsWaiting,
      activeNegotiations, dealsWon, dealsLost, openLeads, stageGroups, sourceGroups,
      upcomingMeetings, recentActivities, overdueFollowUps, recentWon, todayTasks,
      proposalStatusGroups,
    ] = await Promise.all([
      db.lead.count({ where: scoped({ stage: "NEW" }) }),
      db.lead.count({ where: scoped({ stage: "QUALIFIED" }) }),
      db.salesMeeting.count({
        where: {
          ...(visibility ? { lead: visibility } : {}),
          scheduledAt: { gte: todayStart, lt: tomorrowStart },
          status: "SCHEDULED",
        },
      }),
      // Due = a follow-up date that has already arrived, on a still-open lead.
      db.lead.count({
        where: scoped({ nextFollowUpAt: { lte: now }, stage: { in: OPEN_STAGES } }),
      }),
      db.proposal.count({
        where: {
          ...(visibility ? { lead: visibility } : {}),
          status: { in: ["SENT", "VIEWED", "UNDER_REVISION"] },
        },
      }),
      db.lead.count({ where: scoped({ stage: "NEGOTIATION" }) }),
      db.lead.count({ where: scoped({ stage: "WON", wonAt: { gte: monthStart } }) }),
      db.lead.count({ where: scoped({ stage: "LOST", lostAt: { gte: monthStart } }) }),
      // Values are needed, not just counts, so the forecast can be weighted.
      db.lead.findMany({
        where: scoped({ stage: { in: OPEN_STAGES } }),
        select: { estimatedValue: true, probability: true },
      }),
      db.lead.groupBy({ by: ["stage"], where: scoped(), _count: true }),
      db.lead.groupBy({ by: ["source"], where: scoped(), _count: true }),
      db.salesMeeting.findMany({
        where: {
          ...(visibility ? { lead: visibility } : {}),
          scheduledAt: { gte: now },
          status: "SCHEDULED",
        },
        include: {
          lead: { select: { id: true, code: true, companyName: true } },
          organizer: userPick,
          attendees: { include: { user: userPick } },
        },
        orderBy: { scheduledAt: "asc" },
        take: 8,
      }),
      db.salesActivity.findMany({
        where: visibility ? { lead: visibility } : {},
        include: { lead: { select: { id: true, code: true, companyName: true } } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.lead.findMany({
        where: scoped({ nextFollowUpAt: { lte: now }, stage: { in: OPEN_STAGES } }),
        select: {
          id: true, code: true, companyName: true, stage: true, priority: true,
          nextFollowUpAt: true, owner: userPick,
        },
        orderBy: { nextFollowUpAt: "asc" },
        take: 8,
      }),
      db.lead.findMany({
        where: scoped({ stage: "WON" }),
        select: {
          id: true, code: true, companyName: true, estimatedValue: true, wonAt: true,
          convertedClientId: true, owner: userPick,
        },
        orderBy: { wonAt: "desc" },
        take: 6,
      }),
      // The user's own sales tasks for today — reuses the Task model rather
      // than inventing a sales-specific to-do list.
      db.task.findMany({
        where: {
          status: { in: ["TODO", "IN_PROGRESS"] },
          OR: [{ assignees: { some: { userId: user.id } } }, { workerId: user.id }],
          deadline: { lt: tomorrowStart },
        },
        select: { id: true, code: true, title: true, status: true, priority: true, deadline: true },
        orderBy: { deadline: "asc" },
        take: 8,
      }),
      db.proposal.groupBy({
        by: ["status"],
        where: visibility ? { lead: visibility } : {},
        _count: true,
      }),
    ]);

    // ── Derived KPIs ──
    const closedThisMonth = dealsWon + dealsLost;
    const winRate = closedThisMonth ? Math.round((dealsWon / closedThisMonth) * 100) : 0;
    const pipelineValue = totalValue(openLeads);
    const revenueForecast = Math.round(weightedValue(openLeads));

    // ── Monthly conversion trend (6 months) ──
    const trend: { month: string; won: number; lost: number; created: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = companyMonthStart(-i, now);
      const end = companyMonthStart(-i + 1, now);
      const [won, lost, created] = await Promise.all([
        db.lead.count({ where: scoped({ wonAt: { gte: start, lt: end } }) }),
        db.lead.count({ where: scoped({ lostAt: { gte: start, lt: end } }) }),
        db.lead.count({ where: scoped({ createdAt: { gte: start, lt: end } }) }),
      ]);
      trend.push({ month: monthLabel(start), won, lost, created });
    }

    // ── Funnel: leads that have EVER reached each stage ──
    // Counting current stage only would show an empty funnel top once deals
    // move on, so this counts stage history instead.
    const funnelStages: LeadStage[] = [
      "NEW", "QUALIFIED", "DISCOVERY", "PROPOSAL", "NEGOTIATION", "WON",
    ];
    const funnel = await Promise.all(
      funnelStages.map(async (stage) => ({
        stage,
        count: await db.lead.count({
          where: scoped({ stageChanges: { some: { toStage: stage } } }),
        }),
      }))
    );

    // ── Salesperson performance (managers see everyone; members see self) ──
    const ownerGroups = await db.lead.groupBy({
      by: ["ownerId"],
      where: scoped({ ownerId: { not: null } }),
      _count: true,
    });
    const ownerIds = ownerGroups.map((g) => g.ownerId).filter(Boolean) as string[];
    const owners = ownerIds.length
      ? await db.user.findMany({ where: { id: { in: ownerIds } }, ...userPick })
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    const performance = await Promise.all(
      ownerGroups.map(async (g) => {
        const [won, leadRows] = await Promise.all([
          db.lead.count({ where: scoped({ ownerId: g.ownerId, stage: "WON" }) }),
          db.lead.findMany({
            where: scoped({ ownerId: g.ownerId, stage: { in: OPEN_STAGES } }),
            select: { estimatedValue: true, probability: true },
          }),
        ]);
        const person = ownerMap.get(g.ownerId!);
        return {
          userId: g.ownerId!,
          name: person ? `${person.firstName} ${person.lastName}` : "Unknown",
          avatarUrl: person?.avatarUrl ?? null,
          leads: g._count,
          won,
          pipelineValue: Math.round(totalValue(leadRows)),
        };
      })
    );
    performance.sort((a, b) => b.won - a.won || b.pipelineValue - a.pipelineValue);

    // ── Proposal acceptance ──
    const proposalCounts = Object.fromEntries(
      proposalStatusGroups.map((g) => [g.status, g._count])
    ) as Record<string, number>;
    const decided = (proposalCounts.ACCEPTED ?? 0) + (proposalCounts.REJECTED ?? 0);
    const acceptanceRate = decided
      ? Math.round(((proposalCounts.ACCEPTED ?? 0) / decided) * 100)
      : 0;

    // Activity rows carry only actorId, so actors are resolved in one query.
    const actorIds = [...new Set(recentActivities.map((a) => a.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, ...userPick })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return NextResponse.json({
      kpis: {
        newLeads, qualifiedLeads, meetingsToday, followUpsDue, proposalsWaiting,
        activeNegotiations, dealsWon, dealsLost, winRate,
        revenueForecast, pipelineValue: Math.round(pipelineValue),
        acceptanceRate,
      },
      charts: {
        funnel,
        byStage: stageGroups.map((g) => ({ stage: g.stage, count: g._count })),
        bySource: sourceGroups.map((g) => ({ source: g.source, count: g._count })),
        trend,
        performance,
        proposalStatus: proposalStatusGroups.map((g) => ({ status: g.status, count: g._count })),
      },
      widgets: {
        upcomingMeetings,
        todayTasks,
        recentActivities: recentActivities.map((a) => ({
          ...a,
          actor: a.actorId ? (actorMap.get(a.actorId) ?? null) : null,
        })),
        overdueFollowUps,
        recentWon: recentWon.map((l) => ({
          ...l,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
        })),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
