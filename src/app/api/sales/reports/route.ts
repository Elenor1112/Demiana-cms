import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import {
  leadVisibilityFilter, companyMonthStart, monthLabel, totalValue, weightedValue,
  OPEN_STAGES,
} from "@/lib/sales";
import { tableResponse, type Table } from "@/lib/export";
import { LEAD_STAGE_META, LEAD_SOURCE_META } from "@/lib/sales-constants";
import type { LeadStage, Prisma } from "@prisma/client";

/**
 * The sales reporting suite.
 *
 * One endpoint returning every report, because they share the same scope
 * resolution and the same expensive lead scan — splitting them would multiply
 * the round trips for a page that shows them together. `?export=<report>`
 * returns the same data as a downloadable table instead of JSON.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    if (!can(user, "Sales.ViewReports")) {
      throw new ApiError(403, "Missing permission: Sales.ViewReports");
    }
    const visibility = leadVisibilityFilter(user);
    const scoped = (where: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput =>
      visibility ? { AND: [visibility, where] } : where;

    const now = new Date();
    const months = Math.min(Number(req.nextUrl.searchParams.get("months") ?? 12), 24);
    const rangeStart = companyMonthStart(-(months - 1), now);

    const [won, lost, openLeads, sourceGroups, industryRows, proposals, cycleRows, servicesRows] =
      await Promise.all([
        db.lead.findMany({
          where: scoped({ stage: "WON", wonAt: { gte: rangeStart } }),
          select: {
            id: true, code: true, companyName: true, estimatedValue: true, wonAt: true,
            createdAt: true, source: true, industry: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        db.lead.findMany({
          where: scoped({ stage: "LOST", lostAt: { gte: rangeStart } }),
          select: {
            id: true, code: true, companyName: true, estimatedValue: true, lostAt: true,
            lostReason: true, source: true, industry: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        db.lead.findMany({
          where: scoped({ stage: { in: OPEN_STAGES } }),
          select: {
            id: true, code: true, companyName: true, stage: true, estimatedValue: true,
            probability: true, expectedCloseDate: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
        }),
        db.lead.groupBy({ by: ["source"], where: scoped(), _count: true }),
        db.lead.findMany({ where: scoped(), select: { industry: true, stage: true } }),
        db.proposal.findMany({
          where: { ...(visibility ? { lead: visibility } : {}), createdAt: { gte: rangeStart } },
          select: { id: true, status: true, amount: true, sentAt: true, acceptedAt: true },
        }),
        // Cycle time needs the first stage row (creation) and the close date.
        db.lead.findMany({
          where: scoped({ stage: { in: ["WON", "LOST"] }, OR: [{ wonAt: { gte: rangeStart } }, { lostAt: { gte: rangeStart } }] }),
          select: { id: true, createdAt: true, wonAt: true, lostAt: true, stage: true },
        }),
        db.discoveryBrief.findMany({
          where: { ...(visibility ? { lead: visibility } : {}) },
          select: { servicesRequested: true },
        }),
      ]);

    // ── Win rate & loss reasons ──
    const closedCount = won.length + lost.length;
    const winRate = closedCount ? Math.round((won.length / closedCount) * 100) : 0;

    const lossReasons = Object.entries(
      lost.reduce<Record<string, number>>((acc, l) => {
        const key = l.lostReason?.trim() || "Not specified";
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {})
    )
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // ── Lead sources, with the win rate of each ──
    const sources = await Promise.all(
      sourceGroups.map(async (g) => {
        const [sourceWon, sourceClosed] = await Promise.all([
          db.lead.count({ where: scoped({ source: g.source, stage: "WON" }) }),
          db.lead.count({ where: scoped({ source: g.source, stage: { in: ["WON", "LOST"] } }) }),
        ]);
        return {
          source: g.source,
          label: LEAD_SOURCE_META[g.source].label,
          count: g._count,
          won: sourceWon,
          winRate: sourceClosed ? Math.round((sourceWon / sourceClosed) * 100) : 0,
        };
      })
    );
    sources.sort((a, b) => b.count - a.count);

    // ── Average sales cycle (days from creation to close) ──
    const cycles = cycleRows
      .map((l) => {
        const closed = l.wonAt ?? l.lostAt;
        return closed ? (closed.getTime() - l.createdAt.getTime()) / 86_400_000 : null;
      })
      .filter((d): d is number => d !== null && d >= 0);
    const avgCycleDays = cycles.length
      ? Math.round(cycles.reduce((s, d) => s + d, 0) / cycles.length)
      : 0;
    const wonCycles = cycleRows
      .filter((l) => l.stage === "WON" && l.wonAt)
      .map((l) => (l.wonAt!.getTime() - l.createdAt.getTime()) / 86_400_000)
      .filter((d) => d >= 0);
    const avgWonCycleDays = wonCycles.length
      ? Math.round(wonCycles.reduce((s, d) => s + d, 0) / wonCycles.length)
      : 0;

    // ── Proposal acceptance ──
    const accepted = proposals.filter((p) => p.status === "ACCEPTED");
    const rejected = proposals.filter((p) => p.status === "REJECTED");
    const proposalDecided = accepted.length + rejected.length;
    const proposalAcceptance = proposalDecided
      ? Math.round((accepted.length / proposalDecided) * 100)
      : 0;

    // ── Industries ──
    const industries = Object.entries(
      industryRows.reduce<Record<string, { total: number; won: number }>>((acc, l) => {
        const key = l.industry?.trim() || "Unspecified";
        acc[key] ??= { total: 0, won: 0 };
        acc[key].total += 1;
        if (l.stage === "WON") acc[key].won += 1;
        return acc;
      }, {})
    )
      .map(([industry, v]) => ({ industry, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // ── Services requested (from discovery briefs) ──
    const services = Object.entries(
      servicesRows.reduce<Record<string, number>>((acc, b) => {
        for (const s of b.servicesRequested) acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {})
    )
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);

    // ── Monthly / quarterly growth ──
    const monthly: {
      month: string; created: number; won: number; lost: number; revenue: number;
    }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = companyMonthStart(-i, now);
      const end = companyMonthStart(-i + 1, now);
      const [created, monthWon] = await Promise.all([
        db.lead.count({ where: scoped({ createdAt: { gte: start, lt: end } }) }),
        db.lead.findMany({
          where: scoped({ wonAt: { gte: start, lt: end } }),
          select: { estimatedValue: true },
        }),
      ]);
      const monthLost = await db.lead.count({ where: scoped({ lostAt: { gte: start, lt: end } }) });
      monthly.push({
        month: monthLabel(start),
        created,
        won: monthWon.length,
        lost: monthLost,
        revenue: Math.round(totalValue(monthWon)),
      });
    }

    // Quarters are folded from the monthly series rather than re-queried.
    const quarterly: { quarter: string; created: number; won: number; revenue: number }[] = [];
    for (let i = 0; i < monthly.length; i += 3) {
      const chunk = monthly.slice(i, i + 3);
      if (!chunk.length) continue;
      quarterly.push({
        quarter: `${chunk[0].month}–${chunk[chunk.length - 1].month}`,
        created: chunk.reduce((s, m) => s + m.created, 0),
        won: chunk.reduce((s, m) => s + m.won, 0),
        revenue: chunk.reduce((s, m) => s + m.revenue, 0),
      });
    }

    // ── Salesperson performance ──
    const byOwner = new Map<string, { name: string; won: number; lost: number; revenue: number }>();
    for (const l of won) {
      const key = l.owner?.id ?? "unassigned";
      const name = l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : "Unassigned";
      const row = byOwner.get(key) ?? { name, won: 0, lost: 0, revenue: 0 };
      row.won += 1;
      row.revenue += Number(l.estimatedValue ?? 0);
      byOwner.set(key, row);
    }
    for (const l of lost) {
      const key = l.owner?.id ?? "unassigned";
      const name = l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : "Unassigned";
      const row = byOwner.get(key) ?? { name, won: 0, lost: 0, revenue: 0 };
      row.lost += 1;
      byOwner.set(key, row);
    }
    const salespeople = [...byOwner.entries()]
      .map(([userId, v]) => ({
        userId,
        ...v,
        revenue: Math.round(v.revenue),
        winRate: v.won + v.lost ? Math.round((v.won / (v.won + v.lost)) * 100) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // ── Pipeline forecast ──
    const forecastByStage = OPEN_STAGES.map((stage) => {
      const rows = openLeads.filter((l) => l.stage === stage);
      return {
        stage,
        label: LEAD_STAGE_META[stage].label,
        count: rows.length,
        value: Math.round(totalValue(rows)),
        weighted: Math.round(weightedValue(rows)),
      };
    }).filter((r) => r.count > 0);

    const payload = {
      range: { months, from: rangeStart },
      summary: {
        winRate,
        wonCount: won.length,
        lostCount: lost.length,
        revenueClosed: Math.round(totalValue(won)),
        avgDealSize: won.length ? Math.round(totalValue(won) / won.length) : 0,
        avgCycleDays,
        avgWonCycleDays,
        proposalAcceptance,
        proposalsSent: proposals.filter((p) => p.sentAt).length,
        pipelineValue: Math.round(totalValue(openLeads)),
        forecast: Math.round(weightedValue(openLeads)),
      },
      lossReasons,
      sources,
      industries,
      services,
      monthly,
      quarterly,
      salespeople,
      forecastByStage,
    };

    // ── Export branch ──
    const exportName = req.nextUrl.searchParams.get("export");
    if (exportName) {
      const table = buildTable(exportName, payload);
      if (!table) throw new ApiError(400, `Unknown report: ${exportName}`);
      return tableResponse(table);
    }

    return NextResponse.json(payload);
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Map a report name to a downloadable table. */
function buildTable(
  name: string,
  data: Awaited<ReturnType<typeof buildPayloadType>>
): Table | null {
  switch (name) {
    case "summary":
      return {
        name: "Sales summary",
        columns: ["Metric", "Value"],
        rows: Object.entries(data.summary).map(([k, v]) => [humanize(k), v as number]),
      };
    case "loss-reasons":
      return {
        name: "Loss reasons",
        columns: ["Reason", "Deals"],
        rows: data.lossReasons.map((r) => [r.reason, r.count]),
      };
    case "sources":
      return {
        name: "Lead sources",
        columns: ["Source", "Leads", "Won", "Win rate %"],
        rows: data.sources.map((s) => [s.label, s.count, s.won, s.winRate]),
      };
    case "industries":
      return {
        name: "Industries",
        columns: ["Industry", "Leads", "Won"],
        rows: data.industries.map((i) => [i.industry, i.total, i.won]),
      };
    case "services":
      return {
        name: "Services requested",
        columns: ["Service", "Requests"],
        rows: data.services.map((s) => [s.service, s.count]),
      };
    case "monthly":
      return {
        name: "Monthly growth",
        columns: ["Month", "Created", "Won", "Lost", "Revenue"],
        rows: data.monthly.map((m) => [m.month, m.created, m.won, m.lost, m.revenue]),
      };
    case "quarterly":
      return {
        name: "Quarterly growth",
        columns: ["Quarter", "Created", "Won", "Revenue"],
        rows: data.quarterly.map((q) => [q.quarter, q.created, q.won, q.revenue]),
      };
    case "salespeople":
      return {
        name: "Salesperson performance",
        columns: ["Salesperson", "Won", "Lost", "Win rate %", "Revenue"],
        rows: data.salespeople.map((s) => [s.name, s.won, s.lost, s.winRate, s.revenue]),
      };
    case "forecast":
      return {
        name: "Pipeline forecast",
        columns: ["Stage", "Deals", "Value", "Weighted value"],
        rows: data.forecastByStage.map((f) => [f.label, f.count, f.value, f.weighted]),
      };
    default:
      return null;
  }
}

/** "avgCycleDays" → "Avg cycle days". */
function humanize(key: string) {
  const spaced = key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Type-only helper: gives buildTable the exact shape of the payload without
 * repeating it. Never called.
 */
declare function buildPayloadType(): Promise<{
  summary: Record<string, number>;
  lossReasons: { reason: string; count: number }[];
  sources: { label: string; count: number; won: number; winRate: number }[];
  industries: { industry: string; total: number; won: number }[];
  services: { service: string; count: number }[];
  monthly: { month: string; created: number; won: number; lost: number; revenue: number }[];
  quarterly: { quarter: string; created: number; won: number; revenue: number }[];
  salespeople: { name: string; won: number; lost: number; winRate: number; revenue: number }[];
  forecastByStage: { label: string; count: number; value: number; weighted: number }[];
}>;
