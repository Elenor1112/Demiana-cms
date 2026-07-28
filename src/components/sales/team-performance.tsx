"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowUpDown, ArrowLeft, Download, Search, Trophy, ChevronRight,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  StatTile, SectionCard, EmptyState, formatDate,
} from "@/components/sales/sales-bits";
import { PipelineFunnel, ConversionTrend, RevenueTrend } from "@/components/sales/sales-charts";
import { formatCompactMoney, formatMoney } from "@/lib/sales-constants";
import type { SalesPerformance } from "@/lib/sales-performance";
import type { LeadStage } from "@prisma/client";

type TeamRow = SalesPerformance & {
  userId: string; name: string; firstName: string; lastName: string;
  avatarUrl: string | null; jobTitle: string | null; roleName: string;
  status: string; department: string; departmentColor: string;
  joinDate: string | null;
};

type RosterData = {
  team: TeamRow[];
  leaderboard: TeamRow[];
  totals: {
    people: number; totalLeads: number; dealsWon: number; dealsLost: number;
    revenueClosed: number; pipelineValue: number; meetingsHeld: number;
    proposalsSent: number;
  };
};

/** Columns the table can sort by. Keys match the API payload exactly. */
const SORTABLE = [
  { key: "name", label: "Employee", numeric: false },
  { key: "activeLeads", label: "Active leads", numeric: true },
  { key: "totalLeads", label: "Total leads", numeric: true },
  { key: "qualifiedLeads", label: "Qualified", numeric: true },
  { key: "discoveryMeetings", label: "Discovery", numeric: true },
  { key: "discoveryCompletionRate", label: "Disc. rate", numeric: true },
  { key: "meetingsHeld", label: "Meetings", numeric: true },
  { key: "followUpCompletion", label: "Follow-ups", numeric: true },
  { key: "proposalsSent", label: "Proposals", numeric: true },
  { key: "proposalAcceptanceRate", label: "Accept. rate", numeric: true },
  { key: "negotiationsStarted", label: "Negotiations", numeric: true },
  { key: "dealsWon", label: "Won", numeric: true },
  { key: "dealsLost", label: "Lost", numeric: true },
  { key: "winRate", label: "Win rate", numeric: true },
  { key: "pipelineValue", label: "Pipeline", numeric: true },
  { key: "revenueClosed", label: "Revenue", numeric: true },
  { key: "avgDealValue", label: "Avg deal", numeric: true },
  { key: "avgSalesCycleDays", label: "Avg cycle", numeric: true },
  { key: "largestDeal", label: "Largest deal", numeric: true },
] as const;

type SortKey = (typeof SORTABLE)[number]["key"];

/**
 * Lifetime performance for the whole sales team.
 *
 * Two views in one component: a sortable/filterable roster, and a per-person
 * profile reached by clicking a row. Kept together because the profile is a
 * drill-down of the roster rather than a separate destination — going "back"
 * should not lose the table's sort and filters.
 */
export function TeamPerformance() {
  const [q, setQ] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [status, setStatus] = React.useState("ACTIVE");
  const [sortKey, setSortKey] = React.useState<SortKey>("revenueClosed");
  const [sortDesc, setSortDesc] = React.useState(true);
  const [profileId, setProfileId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-team-performance"],
    queryFn: () => apiGet<RosterData>("/api/sales/team/performance"),
  });

  const rows = React.useMemo(() => {
    let list = data?.team ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.jobTitle ?? "").toLowerCase().includes(needle) ||
          r.department.toLowerCase().includes(needle)
      );
    }
    if (department) list = list.filter((r) => r.department === department);
    if (status) list = list.filter((r) => r.status === status);

    const col = SORTABLE.find((c) => c.key === sortKey);
    return [...list].sort((a, b) => {
      if (col && !col.numeric) {
        const cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
        return sortDesc ? -cmp : cmp;
      }
      const diff = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
      return sortDesc ? -diff : diff;
    });
  }, [data, q, department, status, sortKey, sortDesc]);

  const departments = React.useMemo(
    () => [...new Set((data?.team ?? []).map((r) => r.department))].sort(),
    [data]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      // Numbers read best highest-first; names read best A→Z.
      setSortDesc(SORTABLE.find((c) => c.key === key)?.numeric ?? true);
    }
  }

  if (profileId) {
    return <SalespersonProfile userId={profileId} onBack={() => setProfileId(null)} />;
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Salespeople" value={t.people} icon="UsersRound" color="#8B5CF6" />
        <StatTile label="Revenue closed" value={formatCompactMoney(t.revenueClosed)} icon="Wallet" color="#22C55E" />
        <StatTile label="Open pipeline" value={formatCompactMoney(t.pipelineValue)} icon="Filter" color="#06B6D4" />
        <StatTile
          label="Deals won"
          value={t.dealsWon}
          hint={`${t.dealsLost} lost`}
          icon="Trophy"
          color="#F59E0B"
        />
      </div>

      {/* Leaderboard */}
      <SectionCard title="Leaderboard" description="Ranked by lifetime revenue closed.">
        <div className="space-y-2">
          {data.leaderboard.slice(0, 5).map((m, i) => (
            <motion.button
              key={m.userId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setProfileId(m.userId)}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50"
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                style={
                  i < 3
                    ? { backgroundColor: `${MEDALS[i]}1A`, color: MEDALS[i] }
                    : { backgroundColor: "hsl(var(--secondary))", color: "hsl(var(--muted-foreground))" }
                }
              >
                {i < 3 ? <Trophy className="size-4" /> : i + 1}
              </span>
              <Avatar firstName={m.firstName} lastName={m.lastName} src={m.avatarUrl} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{m.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {m.jobTitle ?? m.roleName} · {m.department}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold tabular-nums">{formatCompactMoney(m.revenueClosed)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {m.dealsWon} won · {m.winRate}% win rate
                </div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </motion.button>
          ))}
        </div>
      </SectionCard>

      {/* Roster */}
      <SectionCard
        title="Sales team performance"
        description="Lifetime figures. Click a row for the full profile."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Plain navigation so the browser handles the download and the
              // session cookie rides along.
              window.location.href = "/api/sales/team/performance?export=roster";
            }}
          >
            <Download className="size-4" /> Export
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, title or department…"
              className="pl-9"
            />
          </div>
          <Select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-44"
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-36"
            aria-label="Filter by status"
          >
            <option value="ACTIVE">Active</option>
            <option value="">All statuses</option>
            <option value="DEACTIVATED">Deactivated</option>
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="UsersRound"
            title="No salespeople match"
            description="Try clearing the filters."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="border-b border-border text-left">
                <tr>
                  {SORTABLE.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "pb-2 text-xs font-semibold uppercase tracking-wider",
                        c.numeric ? "text-right" : "text-left"
                      )}
                    >
                      <button
                        onClick={() => toggleSort(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                          sortKey === c.key ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {c.label}
                        <ArrowUpDown
                          className={cn(
                            "size-3",
                            sortKey === c.key ? "opacity-100" : "opacity-40"
                          )}
                        />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.userId}
                    onClick={() => setProfileId(r.userId)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar
                          firstName={r.firstName}
                          lastName={r.lastName}
                          src={r.avatarUrl}
                          size={26}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-medium">{r.name}</span>
                            {r.status !== "ACTIVE" && (
                              <Badge className="text-[9px]">{r.status.toLowerCase()}</Badge>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {r.department}
                            {r.joinDate ? ` · joined ${formatDate(r.joinDate)}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <Num v={r.activeLeads} />
                    <Num v={r.totalLeads} />
                    <Num v={r.qualifiedLeads} />
                    <Num v={r.discoveryMeetings} />
                    <Pct v={r.discoveryCompletionRate} />
                    <Num v={r.meetingsHeld} />
                    <Pct v={r.followUpCompletion} />
                    <Num v={r.proposalsSent} />
                    <Pct v={r.proposalAcceptanceRate} />
                    <Num v={r.negotiationsStarted} />
                    <Num v={r.dealsWon} />
                    <Num v={r.dealsLost} />
                    <Pct v={r.winRate} good />
                    <Money v={r.pipelineValue} />
                    <Money v={r.revenueClosed} bold />
                    <Money v={r.avgDealValue} />
                    <Num v={r.avgSalesCycleDays} suffix="d" />
                    <Money v={r.largestDeal} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

const MEDALS = ["#F59E0B", "#94A3B8", "#B45309"];

function Num({ v, suffix }: { v: number; suffix?: string }) {
  return <td className="py-2.5 text-right tabular-nums">{v}{suffix}</td>;
}

function Money({ v, bold }: { v: number; bold?: boolean }) {
  return (
    <td className={cn("py-2.5 text-right tabular-nums", bold && "font-semibold")}>
      {formatCompactMoney(v)}
    </td>
  );
}

/** A percentage, coloured when it is a headline quality metric. */
function Pct({ v, good }: { v: number; good?: boolean }) {
  return (
    <td className="py-2.5 text-right">
      {good ? (
        <Badge color={v >= 50 ? "#22C55E" : v >= 25 ? "#F59E0B" : "#EF4444"}>{v}%</Badge>
      ) : (
        <span className="tabular-nums">{v}%</span>
      )}
    </td>
  );
}

// ─── Profile drilldown ───────────────────────────────────────

type ProfileData = {
  person: {
    id: string; firstName: string; lastName: string; avatarUrl: string | null;
    jobTitle: string | null; email: string; hireDate: string | null; status: string;
    role: { key: string; name: string };
    department: { id: string; name: string; color: string } | null;
  };
  performance: SalesPerformance;
  trend: { month: string; created: number; won: number; lost: number; revenue: number }[];
  quarterly: { period: string; created: number; won: number; lost: number; revenue: number }[];
  yearly: { period: string; created: number; won: number; lost: number; revenue: number };
  funnel: { stage: LeadStage; count: number }[];
  lossReasons: { reason: string; count: number }[];
  recentWon: {
    id: string; code: string; companyName: string; estimatedValue: number | null;
    wonAt: string | null; createdAt: string; source: string; industry: string | null;
  }[];
  recentLost: {
    id: string; code: string; companyName: string; estimatedValue: number | null;
    lostAt: string | null; lostReason: string | null;
  }[];
};

function SalespersonProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-person-profile", userId],
    queryFn: () => apiGet<ProfileData>(`/api/sales/team/performance?userId=${userId}`),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const { person, performance: p } = data;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to team
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar
            firstName={person.firstName}
            lastName={person.lastName}
            src={person.avatarUrl}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                {person.firstName} {person.lastName}
              </h2>
              {person.status !== "ACTIVE" && <Badge>{person.status.toLowerCase()}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {person.jobTitle ?? person.role.name}
              {person.department ? ` · ${person.department.name}` : ""}
              {person.hireDate ? ` · joined ${formatDate(person.hireDate)}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{person.email}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {formatMoney(p.revenueClosed)}
            </div>
            <div className="text-xs text-muted-foreground">lifetime revenue closed</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-6">
          <ProfileStat label="Total leads" value={p.totalLeads} />
          <ProfileStat label="Active leads" value={p.activeLeads} />
          <ProfileStat label="Qualified" value={p.qualifiedLeads} />
          <ProfileStat label="Meetings held" value={p.meetingsHeld} />
          <ProfileStat label="Discovery briefs" value={p.briefsCompleted} />
          <ProfileStat label="Discovery rate" value={`${p.discoveryCompletionRate}%`} />
          <ProfileStat label="Follow-up rate" value={`${p.followUpCompletion}%`} />
          <ProfileStat label="Proposals sent" value={p.proposalsSent} />
          <ProfileStat label="Acceptance rate" value={`${p.proposalAcceptanceRate}%`} />
          <ProfileStat label="Negotiations" value={p.negotiationsStarted} />
          <ProfileStat label="Deals won" value={p.dealsWon} accent="#22C55E" />
          <ProfileStat label="Deals lost" value={p.dealsLost} accent="#EF4444" />
          <ProfileStat label="Win rate" value={`${p.winRate}%`} accent="#22C55E" />
          <ProfileStat label="Pipeline value" value={formatCompactMoney(p.pipelineValue)} />
          <ProfileStat label="Avg deal value" value={formatCompactMoney(p.avgDealValue)} />
          <ProfileStat label="Largest deal" value={formatCompactMoney(p.largestDeal)} />
          <ProfileStat
            label="Avg sales cycle"
            value={p.avgSalesCycleDays ? `${p.avgSalesCycleDays}d` : "—"}
          />
          <ProfileStat label="Activities" value={p.activities} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Monthly performance" description="Leads created, won and lost.">
          <ConversionTrend data={data.trend} />
        </SectionCard>
        <SectionCard title="Revenue by month" description="Value of deals closed.">
          <RevenueTrend data={data.trend} />
        </SectionCard>
        <SectionCard title="Conversion funnel" description="Leads that reached each stage.">
          {data.funnel.some((f) => f.count > 0) ? (
            <PipelineFunnel data={data.funnel} />
          ) : (
            <EmptyState icon="Filter" title="No pipeline history" />
          )}
        </SectionCard>
        <SectionCard title="Loss reasons" description="Why their deals did not close.">
          {data.lossReasons.length ? (
            <MiniTable
              columns={["Reason", "Deals"]}
              rows={data.lossReasons.map((r) => [r.reason, r.count])}
            />
          ) : (
            <EmptyState icon="CheckCheck" title="No losses recorded" />
          )}
        </SectionCard>

        <SectionCard title="Quarterly performance" description="Rolled up from the monthly series.">
          <MiniTable
            columns={["Quarter", "Created", "Won", "Lost", "Revenue"]}
            rows={data.quarterly.map((qr) => [
              qr.period, qr.created, qr.won, qr.lost, formatCompactMoney(qr.revenue),
            ])}
          />
        </SectionCard>

        <SectionCard title="Lifetime totals" description="Everything on record for this salesperson.">
          <MiniTable
            columns={["Metric", "Value"]}
            rows={[
              ["Leads created", p.totalLeads],
              ["Deals won", p.dealsWon],
              ["Deals lost", p.dealsLost],
              ["Win rate", `${p.winRate}%`],
              ["Revenue closed", formatMoney(p.revenueClosed)],
              ["Largest deal", formatMoney(p.largestDeal)],
              ["Avg sales cycle", p.avgSalesCycleDays ? `${p.avgSalesCycleDays} days` : "—"],
            ]}
          />
        </SectionCard>

        <SectionCard title="Recent wins" className="lg:col-span-2">
          {data.recentWon.length ? (
            <MiniTable
              columns={["Company", "Value", "Won", "Cycle"]}
              rows={data.recentWon.map((l) => [
                `${l.companyName} (${l.code})`,
                formatMoney(l.estimatedValue),
                formatDate(l.wonAt),
                l.wonAt
                  ? `${Math.max(0, Math.round(
                      (new Date(l.wonAt).getTime() - new Date(l.createdAt).getTime()) / 86_400_000
                    ))}d`
                  : "—",
              ])}
            />
          ) : (
            <EmptyState icon="Trophy" title="No wins yet" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ProfileStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className="mt-0.5 font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function MiniTable({
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
              <th key={c} className={cn("pb-2 font-semibold", i > 0 && "text-right")}>
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
                  className={cn("py-2", j > 0 ? "text-right tabular-nums" : "font-medium")}
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
