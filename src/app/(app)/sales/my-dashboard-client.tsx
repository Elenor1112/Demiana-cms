"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, CalendarClock, ClipboardList, FileBadge,
  Handshake, MessageSquareText,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-context";
import {
  StatTile, SectionCard, EmptyState, StageBadge, ProbabilityBar, Icon,
  formatDateTime, formatRelative, formatTime, type PersonRef,
} from "@/components/sales/sales-bits";
import { PipelineFunnel, ConversionTrend } from "@/components/sales/sales-charts";
import {
  SALES_ACTIVITY_META, DEFAULT_ACTIVITY_META, PROPOSAL_STATUS_META,
  formatCompactMoney, formatMoney,
} from "@/lib/sales-constants";
import type { LeadPriority, LeadStage, ProposalStatus } from "@prisma/client";
import type { SalesPerformance } from "@/lib/sales-performance";

type LeadRef = { id: string; code: string; companyName: string };

type MyDashboard = {
  performance: SalesPerformance;
  charts: {
    trend: { month: string; created: number; won: number; lost: number; revenue: number }[];
    funnel: { stage: LeadStage; count: number }[];
  };
  schedule: {
    meetingsToday: {
      id: string; title: string; scheduledAt: string; durationMinutes: number;
      meetingLink: string | null; lead: LeadRef; attendees: { user: PersonRef }[];
    }[];
    upcomingMeetings: {
      id: string; title: string; scheduledAt: string; durationMinutes: number; lead: LeadRef;
    }[];
    overdueFollowUps: {
      id: string; code: string; companyName: string; stage: LeadStage;
      priority: LeadPriority; nextFollowUpAt: string;
    }[];
  };
  pipeline: {
    assignedLeads: {
      id: string; code: string; companyName: string; stage: LeadStage; priority: LeadPriority;
      estimatedValue: number | null; probability: number; expectedCloseDate: string | null;
      nextFollowUpAt: string | null;
    }[];
    discoveryPending: { id: string; code: string; companyName: string; stage: LeadStage }[];
    feedbackPending: { id: string; title: string; scheduledAt: string; lead: LeadRef }[];
    proposalsWaiting: {
      id: string; title: string; version: number; status: ProposalStatus;
      amount: number | null; currency: string; sentAt: string | null; lead: LeadRef;
    }[];
    negotiations: {
      id: string; code: string; companyName: string; estimatedValue: number | null;
      probability: number; expectedCloseDate: string | null;
    }[];
  };
  recentActivities: {
    id: string; verb: string; summary: string | null; createdAt: string;
    lead: { id: string; code: string; companyName: string; stage: LeadStage };
  }[];
};

/**
 * The Sales Member dashboard.
 *
 * Answers "what do I need to do today, and how am I doing" — as distinct from
 * the manager dashboard, which answers "how is the pipeline". Every figure is
 * the caller's own; the API takes no owner parameter at all.
 */
export function MyDashboardClient() {
  const session = useSession();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-my-dashboard"],
    queryFn: () => apiGet<MyDashboard>("/api/sales/my-dashboard"),
    // Kept fresh for a page people leave open; the "today" widgets go stale
    // otherwise.
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
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

  const p = data.performance;
  const s = data.schedule;
  const pipe = data.pipeline;

  return (
    <div className="space-y-4">
      {/* ── Today's schedule: the three things that are time-critical ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Meetings today"
          value={s.meetingsToday.length}
          icon="CalendarClock"
          color="#8B5CF6"
          href="/sales/meetings?range=today"
        />
        <StatTile
          label="Upcoming meetings"
          value={p.meetingsScheduled}
          icon="CalendarPlus"
          color="#0EA5E9"
          href="/sales/meetings?range=upcoming"
        />
        <StatTile
          label="Overdue follow-ups"
          value={p.followUpsDue}
          hint={p.followUpsDue > 0 ? "Needs attention today" : "All on schedule"}
          icon="AlarmClock"
          color={p.followUpsDue > 0 ? "#EF4444" : "#22C55E"}
          href="/sales/leads?followup=due"
        />
      </div>

      {/* ── My pipeline: the work owed ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Assigned leads" value={p.activeLeads} icon="UserSearch" color="#06B6D4" href="/sales/leads?mine=1" />
        <StatTile label="Active opportunities" value={p.activeLeads - p.dealsWon} icon="Filter" color="#0EA5E9" href="/sales/pipeline" />
        <StatTile label="Discovery pending" value={p.discoveryPending} icon="ClipboardList" color="#F59E0B" href="/sales/discovery" />
        <StatTile label="Feedback pending" value={p.feedbackPending} icon="MessageSquareText" color="#F59E0B" href="/sales/feedback" />
        <StatTile label="Proposals waiting" value={p.proposalsWaiting} icon="FileBadge" color="#8B5CF6" href="/sales/proposals" />
        <StatTile label="In negotiation" value={p.activeNegotiations} icon="Handshake" color="#F97316" href="/sales/leads?stage=NEGOTIATION" />
      </div>

      {/* ── Personal analytics ── */}
      <SectionCard
        title="My performance"
        description={`Lifetime figures for ${session.firstName} ${session.lastName}.`}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MiniStat label="Total leads" value={p.totalLeads} />
          <MiniStat label="Qualified" value={p.qualifiedLeads} />
          <MiniStat label="Meetings held" value={p.meetingsHeld} />
          <MiniStat label="Briefs completed" value={p.briefsCompleted} />
          <MiniStat label="Proposals sent" value={p.proposalsSent} />
          <MiniStat label="Deals won" value={p.dealsWon} accent="#22C55E" />
          <MiniStat label="Deals lost" value={p.dealsLost} accent="#EF4444" />
          <MiniStat label="Win rate" value={`${p.winRate}%`} accent="#22C55E" />
          <MiniStat
            label="Avg closing time"
            value={p.avgSalesCycleDays ? `${p.avgSalesCycleDays}d` : "—"}
          />
          <MiniStat label="Avg deal value" value={formatCompactMoney(p.avgDealValue)} />
          <MiniStat label="Pipeline value" value={formatCompactMoney(p.pipelineValue)} accent="#06B6D4" />
          <MiniStat label="Revenue closed" value={formatCompactMoney(p.revenueClosed)} accent="#22C55E" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Monthly performance" description="Your last six months.">
          <ConversionTrend data={data.charts.trend} />
        </SectionCard>

        <SectionCard title="My conversion funnel" description="Leads that reached each stage.">
          {data.charts.funnel.some((f) => f.count > 0) ? (
            <PipelineFunnel data={data.charts.funnel} />
          ) : (
            <EmptyState icon="Filter" title="No pipeline data yet" description="Your funnel appears once you own leads." />
          )}
        </SectionCard>
      </div>

      {/* ── Working lists ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Today's meetings" action={<ViewAll href="/sales/meetings?range=today" />}>
          {s.meetingsToday.length ? (
            <ul className="space-y-2">
              {s.meetingsToday.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/sales/meetings?meeting=${m.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <span className="text-[11px] font-bold leading-none">
                        {formatTime(m.scheduledAt)}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.lead.companyName} · {m.durationMinutes} min
                      </div>
                    </div>
                    <div className="flex -space-x-1.5">
                      {m.attendees.slice(0, 3).map((a) => (
                        <Avatar
                          key={a.user.id}
                          firstName={a.user.firstName}
                          lastName={a.user.lastName}
                          src={a.user.avatarUrl}
                          size={22}
                        />
                      ))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="CalendarCheck" title="Nothing today" description="No meetings on your calendar." />
          )}
        </SectionCard>

        <SectionCard title="Overdue follow-ups" action={<ViewAll href="/sales/leads?followup=due" />}>
          {s.overdueFollowUps.length ? (
            <ul className="space-y-2">
              {s.overdueFollowUps.map((l) => (
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

        <SectionCard title="Forms owed" description="Discovery briefs and meeting debriefs still outstanding.">
          {pipe.discoveryPending.length === 0 && pipe.feedbackPending.length === 0 ? (
            <EmptyState icon="CheckCheck" title="All caught up" description="No forms outstanding." />
          ) : (
            <div className="space-y-3">
              {pipe.discoveryPending.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <ClipboardList className="size-3.5" /> Discovery briefs
                  </div>
                  <ul className="space-y-1.5">
                    {pipe.discoveryPending.map((l) => (
                      <li key={l.id}>
                        <Link
                          href={`/sales/leads/${l.id}?tab=discovery`}
                          className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm transition-colors hover:border-primary/50"
                        >
                          <span className="min-w-0 flex-1 truncate">{l.companyName}</span>
                          <StageBadge stage={l.stage} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pipe.feedbackPending.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <MessageSquareText className="size-3.5" /> Meeting feedback
                  </div>
                  <ul className="space-y-1.5">
                    {pipe.feedbackPending.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/sales/leads/${m.lead.id}?tab=feedback`}
                          className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm transition-colors hover:border-primary/50"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {m.title}
                            <span className="text-muted-foreground"> · {m.lead.companyName}</span>
                          </span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {formatRelative(m.scheduledAt)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Proposals waiting" action={<ViewAll href="/sales/proposals" />}>
          {pipe.proposalsWaiting.length ? (
            <ul className="space-y-2">
              {pipe.proposalsWaiting.map((pr) => (
                <li key={pr.id}>
                  <Link
                    href={`/sales/leads/${pr.lead.id}?tab=proposal`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                      <FileBadge className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {pr.title} <span className="text-muted-foreground">v{pr.version}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {pr.lead.companyName}
                        {pr.sentAt ? ` · sent ${formatRelative(pr.sentAt)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">
                        {formatMoney(pr.amount, pr.currency)}
                      </div>
                      <Badge color={PROPOSAL_STATUS_META[pr.status].color} className="text-[10px]">
                        {PROPOSAL_STATUS_META[pr.status].label}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="FileBadge" title="No proposals awaiting a decision" />
          )}
        </SectionCard>

        <SectionCard title="Deals in negotiation" action={<ViewAll href="/sales/leads?stage=NEGOTIATION" />}>
          {pipe.negotiations.length ? (
            <ul className="space-y-2">
              {pipe.negotiations.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/sales/leads/${l.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5 transition-colors hover:border-primary/50"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Handshake className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{l.companyName}</div>
                      <ProbabilityBar value={l.probability} className="mt-1" />
                    </div>
                    <span className="shrink-0 text-sm font-semibold">
                      {formatCompactMoney(l.estimatedValue)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Handshake" title="Nothing in negotiation" />
          )}
        </SectionCard>

        <SectionCard title="My recent activity" action={<ViewAll href="/sales/activities" />}>
          {data.recentActivities.length ? (
            <ol className="relative space-y-3 border-l border-border pl-5">
              {data.recentActivities.map((a) => {
                const meta = SALES_ACTIVITY_META[a.verb] ?? DEFAULT_ACTIVITY_META;
                return (
                  <li key={a.id} className="relative">
                    <span
                      className="absolute -left-[27px] flex size-5 items-center justify-center rounded-full ring-4 ring-card"
                      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
                    >
                      <Icon name={meta.icon} className="size-2.5" />
                    </span>
                    <div className="text-sm">
                      <span className="font-medium">{meta.label}</span>
                      {" · "}
                      <Link href={`/sales/leads/${a.lead.id}`} className="text-primary hover:underline">
                        {a.lead.companyName}
                      </Link>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDateTime(a.createdAt)} · {formatRelative(a.createdAt)}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon="Activity" title="No activity yet" description="Your actions appear here." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/** Compact metric inside the performance card, where a full tile is too heavy. */
function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className="mt-0.5 text-lg font-bold tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
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
