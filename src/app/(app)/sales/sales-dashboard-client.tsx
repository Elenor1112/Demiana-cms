"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarClock, CheckSquare, Trophy } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatTile, SectionCard, EmptyState, StageBadge, Icon,
  formatDateTime, formatRelative, formatDate,
} from "@/components/sales/sales-bits";
import {
  PipelineFunnel, SourceDonut, ConversionTrend, AcceptanceBar, PerformanceBar,
} from "@/components/sales/sales-charts";
import {
  LEAD_SOURCE_META, PROPOSAL_STATUS_META, SALES_ACTIVITY_META,
  DEFAULT_ACTIVITY_META, formatCompactMoney,
} from "@/lib/sales-constants";
import { PRIORITY_META } from "@/lib/constants";
import type { LeadStage, ProposalStatus, LeadSource, TaskPriority, TaskStatus } from "@prisma/client";
import type { PersonRef } from "@/components/sales/sales-bits";

type DashboardData = {
  kpis: {
    newLeads: number; qualifiedLeads: number; meetingsToday: number;
    followUpsDue: number; proposalsWaiting: number; activeNegotiations: number;
    dealsWon: number; dealsLost: number; winRate: number;
    revenueForecast: number; pipelineValue: number; acceptanceRate: number;
  };
  charts: {
    funnel: { stage: LeadStage; count: number }[];
    byStage: { stage: LeadStage; count: number }[];
    bySource: { source: LeadSource; count: number }[];
    trend: { month: string; won: number; lost: number; created: number }[];
    performance: {
      userId: string; name: string; avatarUrl: string | null;
      leads: number; won: number; pipelineValue: number;
    }[];
    proposalStatus: { status: ProposalStatus; count: number }[];
  };
  widgets: {
    upcomingMeetings: {
      id: string; title: string; scheduledAt: string; durationMinutes: number;
      lead: { id: string; code: string; companyName: string };
      organizer: PersonRef;
      attendees: { user: PersonRef }[];
    }[];
    todayTasks: {
      id: string; code: string; title: string; status: TaskStatus;
      priority: TaskPriority; deadline: string | null;
    }[];
    recentActivities: {
      id: string; verb: string; summary: string | null; createdAt: string;
      actor: PersonRef | null;
      lead: { id: string; code: string; companyName: string };
    }[];
    overdueFollowUps: {
      id: string; code: string; companyName: string; stage: LeadStage;
      priority: TaskPriority; nextFollowUpAt: string; owner: PersonRef | null;
    }[];
    recentWon: {
      id: string; code: string; companyName: string; estimatedValue: number | null;
      wonAt: string | null; convertedClientId: string | null; owner: PersonRef | null;
    }[];
  };
};

export function SalesDashboardClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales-dashboard"],
    queryFn: () => apiGet<DashboardData>("/api/sales/dashboard"),
    // The dashboard is the page people leave open; a quiet refetch keeps the
    // "today" widgets honest without a manual reload.
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const k = data.kpis;

  const tiles = [
    { label: "New Leads", value: k.newLeads, icon: "Sparkles", color: "#06B6D4", href: "/sales/leads?stage=NEW" },
    { label: "Qualified", value: k.qualifiedLeads, icon: "BadgeCheck", color: "#0EA5E9", href: "/sales/leads?stage=QUALIFIED" },
    { label: "Meetings Today", value: k.meetingsToday, icon: "CalendarClock", color: "#8B5CF6", href: "/sales/meetings?range=today" },
    { label: "Follow-ups Due", value: k.followUpsDue, icon: "AlarmClock", color: k.followUpsDue > 0 ? "#EF4444" : "#64748B", href: "/sales/leads?followup=due" },
    { label: "Proposals Waiting", value: k.proposalsWaiting, icon: "FileBadge", color: "#F59E0B", href: "/sales/proposals" },
    { label: "Negotiations", value: k.activeNegotiations, icon: "Handshake", color: "#F97316", href: "/sales/leads?stage=NEGOTIATION" },
    { label: "Deals Won", value: k.dealsWon, hint: "This month", icon: "Trophy", color: "#22C55E", href: "/sales/leads?stage=WON" },
    { label: "Win Rate", value: `${k.winRate}%`, hint: "This month", icon: "Percent", color: "#22C55E" },
    { label: "Revenue Forecast", value: formatCompactMoney(k.revenueForecast), hint: "Weighted", icon: "TrendingUp", color: "#06B6D4" },
    { label: "Pipeline Value", value: formatCompactMoney(k.pipelineValue), hint: "Open deals", icon: "Wallet", color: "#8B5CF6" },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <StatTile {...t} />
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Pipeline funnel" description="Leads that have reached each stage.">
          {data.charts.funnel.some((f) => f.count > 0) ? (
            <PipelineFunnel data={data.charts.funnel} />
          ) : (
            <EmptyState icon="Filter" title="No pipeline data yet" description="Create your first lead to see the funnel." />
          )}
        </SectionCard>

        <SectionCard title="Leads by source" description="Where the pipeline comes from.">
          {data.charts.bySource.length ? (
            <SourceDonut
              data={data.charts.bySource.map((s) => ({
                label: LEAD_SOURCE_META[s.source].label,
                count: s.count,
              }))}
            />
          ) : (
            <EmptyState icon="ChartPie" title="No leads yet" />
          )}
        </SectionCard>

        <SectionCard title="Monthly conversions" description="New, won and lost over six months.">
          <ConversionTrend data={data.charts.trend} />
        </SectionCard>

        <SectionCard
          title="Proposal acceptance"
          description={`${k.acceptanceRate}% of decided proposals accepted.`}
        >
          <AcceptanceBar
            data={data.charts.proposalStatus.map((p) => ({
              status: PROPOSAL_STATUS_META[p.status].label,
              count: p.count,
              color: PROPOSAL_STATUS_META[p.status].color,
            }))}
          />
        </SectionCard>

        {data.charts.performance.length > 0 && (
          <SectionCard
            title="Salesperson performance"
            description="Deals won per owner."
            className="lg:col-span-2"
          >
            <PerformanceBar data={data.charts.performance} />
          </SectionCard>
        )}
      </div>

      {/* Widgets */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Upcoming meetings"
          action={<ViewAll href="/sales/meetings" />}
        >
          {data.widgets.upcomingMeetings.length ? (
            <ul className="space-y-2">
              {data.widgets.upcomingMeetings.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/sales/meetings?meeting=${m.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarClock className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.lead.companyName} · {formatDateTime(m.scheduledAt)}
                      </div>
                    </div>
                    <Badge className="shrink-0">{m.durationMinutes}m</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="CalendarClock" title="Nothing scheduled" description="No upcoming meetings." />
          )}
        </SectionCard>

        <SectionCard title="Today's tasks" action={<ViewAll href="/tasks" />}>
          {data.widgets.todayTasks.length ? (
            <ul className="space-y-2">
              {data.widgets.todayTasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tasks?task=${t.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <CheckSquare className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.code} · due {formatDate(t.deadline)}
                      </div>
                    </div>
                    <Badge color={PRIORITY_META[t.priority].color} className="shrink-0">
                      {PRIORITY_META[t.priority].label}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="CheckCheck" title="All clear" description="No tasks due today." />
          )}
        </SectionCard>

        <SectionCard title="Overdue follow-ups" action={<ViewAll href="/sales/leads?followup=due" />}>
          {data.widgets.overdueFollowUps.length ? (
            <ul className="space-y-2">
              {data.widgets.overdueFollowUps.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/sales/leads/${l.id}`}
                    className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 transition-colors hover:border-destructive/60"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                      <AlertTriangle className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.companyName}</div>
                      <div className="text-xs text-muted-foreground">
                        Due {formatRelative(l.nextFollowUpAt)}
                      </div>
                    </div>
                    <StageBadge stage={l.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="CheckCheck" title="Nothing overdue" description="Every follow-up is on schedule." />
          )}
        </SectionCard>

        <SectionCard title="Recent won deals" action={<ViewAll href="/sales/clients" />}>
          {data.widgets.recentWon.length ? (
            <ul className="space-y-2">
              {data.widgets.recentWon.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/sales/leads/${l.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                      <Trophy className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.companyName}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatCompactMoney(l.estimatedValue)} · {formatRelative(l.wonAt)}
                      </div>
                    </div>
                    {l.convertedClientId ? (
                      <Badge color="#22C55E">Client</Badge>
                    ) : (
                      <Badge color="#F59E0B">To convert</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Trophy" title="No wins yet" description="Closed deals will appear here." />
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          action={<ViewAll href="/sales/activities" />}
          className="lg:col-span-2"
        >
          {data.widgets.recentActivities.length ? (
            <ul className="space-y-2.5">
              {data.widgets.recentActivities.map((a) => {
                const meta = SALES_ACTIVITY_META[a.verb] ?? DEFAULT_ACTIVITY_META;
                return (
                  <li key={a.id} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                    >
                      <Icon name={meta.icon} className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        <span className="font-medium">{meta.label}</span>
                        {" · "}
                        <Link href={`/sales/leads/${a.lead.id}`} className="text-primary hover:underline">
                          {a.lead.companyName}
                        </Link>
                      </div>
                      {a.summary && (
                        <div className="truncate text-xs text-muted-foreground">{a.summary}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {a.actor && (
                        <Avatar
                          firstName={a.actor.firstName}
                          lastName={a.actor.lastName}
                          src={a.actor.avatarUrl}
                          size={20}
                        />
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelative(a.createdAt)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="Activity" title="No activity yet" />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      View all <ArrowRight className="size-3" />
    </Link>
  );
}
