import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { requireSalesModule } from "@/lib/sales";
import {
  computePerformance, monthlyTrend, conversionFunnel, lossReasons, rollUpPeriods,
} from "@/lib/sales-performance";
import { tableResponse, type Table } from "@/lib/export";

/**
 * Lifetime performance for every salesperson.
 *
 * Managers use this to evaluate people across their whole history, so the
 * window is deliberately unbounded — "lifetime" means every lead they have ever
 * owned, not a rolling year.
 *
 * `?userId=` switches to a single-person profile with trends, funnel and loss
 * reasons attached. `?export=` returns the roster as a downloadable table.
 *
 * Every number is computed from the CRM tables at request time by
 * computePerformance — the same function the personal dashboard uses, so a
 * salesperson and their manager can never see different figures for the same
 * metric.
 */
export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    if (!can(user, "Sales.ViewTeam")) {
      throw new ApiError(403, "Missing permission: Sales.ViewTeam");
    }

    const sp = req.nextUrl.searchParams;
    const userId = sp.get("userId");
    const months = Math.min(Number(sp.get("months") ?? 12), 24);

    // ── Single-person profile ──
    if (userId) {
      const person = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true,
          email: true, hireDate: true, status: true,
          role: { select: { key: true, name: true } },
          department: { select: { id: true, name: true, color: true } },
        },
      });
      if (!person) throw new ApiError(404, "Salesperson not found.");

      const [performance, trend, funnel, reasons, recentWon, recentLost] = await Promise.all([
        computePerformance({ ownerId: userId }),
        monthlyTrend(userId, months),
        conversionFunnel(userId),
        lossReasons(userId),
        db.lead.findMany({
          where: { ownerId: userId, stage: "WON" },
          select: {
            id: true, code: true, companyName: true, estimatedValue: true,
            wonAt: true, createdAt: true, source: true, industry: true,
          },
          orderBy: { wonAt: "desc" },
          take: 10,
        }),
        db.lead.findMany({
          where: { ownerId: userId, stage: "LOST" },
          select: {
            id: true, code: true, companyName: true, estimatedValue: true,
            lostAt: true, lostReason: true,
          },
          orderBy: { lostAt: "desc" },
          take: 10,
        }),
      ]);

      const { quarterly, yearly } = rollUpPeriods(trend);

      return NextResponse.json({
        person,
        performance,
        trend,
        quarterly,
        yearly,
        funnel,
        lossReasons: reasons,
        recentWon: recentWon.map((l) => ({
          ...l,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
        })),
        recentLost: recentLost.map((l) => ({
          ...l,
          estimatedValue: l.estimatedValue ? Number(l.estimatedValue) : null,
        })),
      });
    }

    // ── Roster ──
    // The team is resolved by PERMISSION, so granting Sales.View to someone
    // includes them here without a code change. Deactivated people are kept:
    // a leaver's historical numbers are part of evaluating the team.
    const members = await db.user.findMany({
      where: {
        OR: [
          { role: { permissions: { some: { permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } } },
          { permissions: { some: { effect: "ALLOW", permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } },
        ],
      },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true,
        hireDate: true, status: true,
        role: { select: { key: true, name: true } },
        department: { select: { id: true, name: true, color: true } },
      },
      orderBy: { firstName: "asc" },
    });

    const rows = await Promise.all(
      members.map(async (m) => ({
        userId: m.id,
        name: `${m.firstName} ${m.lastName}`,
        firstName: m.firstName,
        lastName: m.lastName,
        avatarUrl: m.avatarUrl,
        jobTitle: m.jobTitle,
        roleName: m.role.name,
        status: m.status,
        department: m.department?.name ?? "—",
        departmentColor: m.department?.color ?? "#64748B",
        joinDate: m.hireDate,
        ...(await computePerformance({ ownerId: m.id })),
      }))
    );

    // Revenue first, deals won as the tie-break — the same order the Team page
    // leaderboard uses, so the two never disagree about who is top.
    const leaderboard = [...rows].sort(
      (a, b) => b.revenueClosed - a.revenueClosed || b.dealsWon - a.dealsWon
    );

    const totals = {
      people: rows.length,
      totalLeads: rows.reduce((s, r) => s + r.totalLeads, 0),
      dealsWon: rows.reduce((s, r) => s + r.dealsWon, 0),
      dealsLost: rows.reduce((s, r) => s + r.dealsLost, 0),
      revenueClosed: rows.reduce((s, r) => s + r.revenueClosed, 0),
      pipelineValue: rows.reduce((s, r) => s + r.pipelineValue, 0),
      meetingsHeld: rows.reduce((s, r) => s + r.meetingsHeld, 0),
      proposalsSent: rows.reduce((s, r) => s + r.proposalsSent, 0),
    };

    if (sp.get("export")) {
      return tableResponse(buildRosterTable(rows));
    }

    return NextResponse.json({ team: rows, leaderboard, totals });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** The roster as a downloadable table — every column the brief lists. */
function buildRosterTable(
  rows: (Awaited<ReturnType<typeof computePerformance>> & {
    name: string; department: string; joinDate: Date | null;
  })[]
): Table {
  return {
    name: "Sales team performance",
    columns: [
      "Employee", "Department", "Join date", "Active leads", "Total leads",
      "Qualified leads", "Discovery meetings", "Discovery completion %",
      "Meetings held", "Follow-up completion %", "Proposals sent",
      "Proposal acceptance %", "Negotiations started", "Deals won", "Deals lost",
      "Win rate %", "Pipeline value", "Revenue closed", "Avg deal value",
      "Avg sales cycle (days)", "Largest deal",
    ],
    rows: rows.map((r) => [
      r.name,
      r.department,
      r.joinDate ? r.joinDate.toISOString().slice(0, 10) : "—",
      r.activeLeads,
      r.totalLeads,
      r.qualifiedLeads,
      r.discoveryMeetings,
      r.discoveryCompletionRate,
      r.meetingsHeld,
      r.followUpCompletion,
      r.proposalsSent,
      r.proposalAcceptanceRate,
      r.negotiationsStarted,
      r.dealsWon,
      r.dealsLost,
      r.winRate,
      r.pipelineValue,
      r.revenueClosed,
      r.avgDealValue,
      r.avgSalesCycleDays,
      r.largestDeal,
    ]),
  };
}
