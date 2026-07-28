"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Download, Printer } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { useCan } from "@/components/session-context";
import { TeamPerformance } from "@/components/sales/team-performance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile, SectionCard, EmptyState } from "@/components/sales/sales-bits";
import { ConversionTrend, RevenueTrend, ForecastBar, SourceDonut } from "@/components/sales/sales-charts";
import { formatCompactMoney, formatMoney } from "@/lib/sales-constants";

type ReportData = {
  range: { months: number; from: string };
  summary: {
    winRate: number; wonCount: number; lostCount: number; revenueClosed: number;
    avgDealSize: number; avgCycleDays: number; avgWonCycleDays: number;
    proposalAcceptance: number; proposalsSent: number;
    pipelineValue: number; forecast: number;
  };
  lossReasons: { reason: string; count: number }[];
  sources: { source: string; label: string; count: number; won: number; winRate: number }[];
  industries: { industry: string; total: number; won: number }[];
  services: { service: string; count: number }[];
  monthly: { month: string; created: number; won: number; lost: number; revenue: number }[];
  quarterly: { quarter: string; created: number; won: number; revenue: number }[];
  salespeople: {
    userId: string; name: string; won: number; lost: number;
    winRate: number; revenue: number;
  }[];
  forecastByStage: {
    stage: string; label: string; count: number; value: number; weighted: number;
  }[];
};

/** Reports offered for download. Names match the API's export switch. */
const EXPORTS = [
  { key: "summary", label: "Summary" },
  { key: "loss-reasons", label: "Loss reasons" },
  { key: "sources", label: "Lead sources" },
  { key: "industries", label: "Industries" },
  { key: "services", label: "Services requested" },
  { key: "monthly", label: "Monthly growth" },
  { key: "quarterly", label: "Quarterly growth" },
  { key: "salespeople", label: "Salesperson performance" },
  { key: "forecast", label: "Pipeline forecast" },
];

export function ReportsClient() {
  const can = useCan();
  // Lifetime team evaluation is manager territory, so the tab only exists for
  // holders of Sales.ViewTeam — the API enforces the same permission.
  const canViewTeam = can("Sales.ViewTeam");
  const [tab, setTab] = React.useState<"pipeline" | "team">("pipeline");

  return (
    <div>
      {canViewTeam && (
        <div className="mb-4 flex gap-1 border-b border-border">
          {([
            { key: "pipeline", label: "Pipeline reports" },
            { key: "team", label: "Sales Team Performance" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="reports-tab-active"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          ))}
        </div>
      )}

      {canViewTeam && tab === "team" ? <TeamPerformance /> : <PipelineReports />}
    </div>
  );
}

function PipelineReports() {
  const [months, setMonths] = React.useState("12");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-reports", months],
    queryFn: () => apiGet<ReportData>(`/api/sales/reports?months=${months}`),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const s = data.summary;

  return (
    // print:* rules turn the page into a clean PDF via the browser's own
    // print-to-PDF, which is why no PDF library is needed.
    <div className="space-y-4 print:space-y-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={months} onChange={(e) => setMonths(e.target.value)} className="w-40">
          <option value="3">Last 3 months</option>
          <option value="6">Last 6 months</option>
          <option value="12">Last 12 months</option>
          <option value="24">Last 24 months</option>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / PDF
        </Button>
        <Select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            // A plain navigation, so the browser handles the download and the
            // session cookie rides along.
            window.location.href = `/api/sales/reports?months=${months}&export=${e.target.value}`;
            e.target.value = "";
          }}
          className="w-52"
          aria-label="Export a report"
        >
          <option value="">Export to CSV / Excel…</option>
          {EXPORTS.map((x) => (
            <option key={x.key} value={x.key}>{x.label}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Win rate" value={`${s.winRate}%`} hint={`${s.wonCount}W / ${s.lostCount}L`} icon="Percent" color="#22C55E" />
        <StatTile label="Revenue closed" value={formatCompactMoney(s.revenueClosed)} icon="Wallet" color="#06B6D4" />
        <StatTile label="Avg deal size" value={formatCompactMoney(s.avgDealSize)} icon="TrendingUp" color="#8B5CF6" />
        <StatTile label="Avg sales cycle" value={`${s.avgCycleDays}d`} hint={`Won: ${s.avgWonCycleDays}d`} icon="Clock" color="#F59E0B" />
        <StatTile label="Proposal acceptance" value={`${s.proposalAcceptance}%`} hint={`${s.proposalsSent} sent`} icon="FileBadge" color="#0EA5E9" />
        <StatTile label="Pipeline value" value={formatCompactMoney(s.pipelineValue)} icon="Filter" color="#8B5CF6" />
        <StatTile label="Revenue forecast" value={formatCompactMoney(s.forecast)} hint="Weighted" icon="ChartNoAxesCombined" color="#06B6D4" />
        <StatTile label="Deals won" value={s.wonCount} icon="Trophy" color="#22C55E" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Monthly growth" description="New leads, wins and losses.">
          <ConversionTrend data={data.monthly} />
        </SectionCard>

        <SectionCard title="Revenue closed" description="Value of deals won per month.">
          <RevenueTrend data={data.monthly} />
        </SectionCard>

        <SectionCard
          title="Pipeline forecast"
          description="Gross value against probability-weighted forecast."
          className="lg:col-span-2"
        >
          {data.forecastByStage.length ? (
            <ForecastBar data={data.forecastByStage} />
          ) : (
            <EmptyState icon="Filter" title="No open pipeline" />
          )}
        </SectionCard>

        <SectionCard title="Lead sources" description="Volume and win rate by channel.">
          {data.sources.length ? (
            <SimpleTable
              columns={["Source", "Leads", "Won", "Win rate"]}
              rows={data.sources.map((x) => [x.label, x.count, x.won, `${x.winRate}%`])}
            />
          ) : (
            <EmptyState icon="ChartPie" title="No data" />
          )}
        </SectionCard>

        <SectionCard title="Source mix" description="Share of pipeline by origin.">
          {data.sources.length ? (
            <SourceDonut data={data.sources.map((x) => ({ label: x.label, count: x.count }))} />
          ) : (
            <EmptyState icon="ChartPie" title="No data" />
          )}
        </SectionCard>

        <SectionCard title="Loss reasons" description="Why deals did not close.">
          {data.lossReasons.length ? (
            <SimpleTable
              columns={["Reason", "Deals"]}
              rows={data.lossReasons.map((x) => [x.reason, x.count])}
            />
          ) : (
            <EmptyState icon="CheckCheck" title="No losses recorded" />
          )}
        </SectionCard>

        <SectionCard title="Industries" description="Where the pipeline concentrates.">
          {data.industries.length ? (
            <SimpleTable
              columns={["Industry", "Leads", "Won"]}
              rows={data.industries.map((x) => [x.industry, x.total, x.won])}
            />
          ) : (
            <EmptyState icon="Building2" title="No data" />
          )}
        </SectionCard>

        <SectionCard title="Services requested" description="From submitted discovery briefs.">
          {data.services.length ? (
            <SimpleTable
              columns={["Service", "Requests"]}
              rows={data.services.map((x) => [x.service, x.count])}
            />
          ) : (
            <EmptyState icon="ClipboardList" title="No briefs submitted yet" />
          )}
        </SectionCard>

        <SectionCard title="Salesperson performance" description="Closed business per owner.">
          {data.salespeople.length ? (
            <SimpleTable
              columns={["Salesperson", "Won", "Lost", "Win rate", "Revenue"]}
              rows={data.salespeople.map((x) => [
                x.name, x.won, x.lost, `${x.winRate}%`, formatMoney(x.revenue),
              ])}
            />
          ) : (
            <EmptyState icon="Users" title="No closed deals yet" />
          )}
        </SectionCard>

        <SectionCard title="Quarterly growth" description="Rolled up from the monthly series.">
          {data.quarterly.length ? (
            <SimpleTable
              columns={["Quarter", "Created", "Won", "Revenue"]}
              rows={data.quarterly.map((x) => [
                x.quarter, x.created, x.won, formatMoney(x.revenue),
              ])}
            />
          ) : (
            <EmptyState icon="ChartColumn" title="No data" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/** Compact table used across the report cards; scrolls rather than overflowing. */
function SimpleTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left">
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            {columns.map((c, i) => (
              <th key={c} className={`pb-2 font-semibold ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-2 ${j > 0 ? "text-right tabular-nums" : "font-medium"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { Download };
