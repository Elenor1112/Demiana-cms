"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { Building2, Calendar, TrendingUp, User as UserIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { APP_TIMEZONE } from "@/lib/timezone";
import {
  LEAD_STAGE_META, LEAD_PRIORITY_META, TEMPERATURE_META, formatCompactMoney,
} from "@/lib/sales-constants";
import type {
  LeadPriority, LeadSource, LeadStage, OpportunityTemperature,
} from "@prisma/client";

/**
 * Shared building blocks for the Sales workspace.
 *
 * Everything here composes the existing Card/Badge/Avatar primitives rather
 * than restyling them, so the workspace inherits the Elenor OS look for free
 * and changes to the design system land here automatically.
 */

// ─── Shared types ────────────────────────────────────────────

export type PersonRef = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type LeadListItem = {
  id: string;
  code: string;
  companyName: string;
  brandName: string | null;
  contactPerson: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  stage: LeadStage;
  priority: LeadPriority;
  source: LeadSource;
  estimatedValue: number | null;
  probability: number;
  expectedCloseDate: string | null;
  nextFollowUpAt: string | null;
  lastActivityAt: string | null;
  tags: string[];
  wonAt: string | null;
  lostAt: string | null;
  convertedClientId: string | null;
  createdAt: string;
  owner: PersonRef | null;
  _count?: { meetings: number; proposals: number; briefs: number; feedback: number };
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = (Icons as unknown as Record<string, React.FC<{ className?: string }>>)[name];
  return Cmp ? <Cmp className={className} /> : null;
}

// ─── Badges ──────────────────────────────────────────────────

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  const meta = LEAD_STAGE_META[stage];
  return <Badge color={meta.color} className={className}>{meta.label}</Badge>;
}

export function PriorityDot({ priority }: { priority: LeadPriority }) {
  const meta = LEAD_PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

export function TemperatureBadge({
  temperature,
  score,
}: {
  temperature: OpportunityTemperature;
  score?: number;
}) {
  const meta = TEMPERATURE_META[temperature];
  return (
    <Badge color={meta.color} className="gap-1">
      <Icon name={meta.icon} className="size-3" />
      {meta.label}
      {score !== undefined && <span className="opacity-70">· {score}</span>}
    </Badge>
  );
}

/**
 * Probability as a slim meter.
 *
 * A bar rather than a number alone: on a Kanban card the eye compares lengths
 * far faster than it reads percentages.
 */
export function ProbabilityBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {value}%
      </span>
    </div>
  );
}

// ─── KPI tile ────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
  icon,
  color,
  href,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: string;
  color?: string;
  href?: string;
  loading?: boolean;
}) {
  const body = (
    <Card
      className={cn(
        "h-full p-4 transition-colors",
        href && "hover:border-primary/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color ?? "#06B6D4"}1A`, color: color ?? "#06B6D4" }}
          >
            <Icon name={icon} className="size-4" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      )}
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </Card>
  );

  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

// ─── Lead card (pipeline + lists) ────────────────────────────

export function LeadCard({
  lead,
  onClick,
  dragging,
}: {
  lead: LeadListItem;
  onClick?: () => void;
  dragging?: boolean;
}) {
  const nextFollowUp = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const overdue = nextFollowUp ? nextFollowUp.getTime() <= Date.now() : false;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer select-none p-3 transition-all hover:border-primary/50 hover:shadow-md",
        dragging && "opacity-40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-tight">{lead.companyName}</div>
          {lead.contactPerson && (
            <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <UserIcon className="size-3 shrink-0" />
              {lead.contactPerson}
            </div>
          )}
        </div>
        <span
          className="mt-0.5 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: LEAD_PRIORITY_META[lead.priority].color }}
          title={`${LEAD_PRIORITY_META[lead.priority].label} priority`}
        />
      </div>

      {lead.estimatedValue !== null && (
        <div className="mt-2 text-sm font-semibold text-foreground">
          {formatCompactMoney(lead.estimatedValue)}
        </div>
      )}

      <ProbabilityBar value={lead.probability} className="mt-2" />

      <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2">
        {lead.owner ? (
          <Avatar
            firstName={lead.owner.firstName}
            lastName={lead.owner.lastName}
            src={lead.owner.avatarUrl}
            size={22}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">Unassigned</span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{lead.code}</span>
      </div>

      {nextFollowUp && (
        <div
          className={cn(
            "mt-1.5 flex items-center gap-1 text-[11px]",
            overdue ? "font-medium text-destructive" : "text-muted-foreground"
          )}
        >
          <Calendar className="size-3" />
          {overdue ? "Follow-up overdue" : `Follow-up ${formatDate(nextFollowUp)}`}
        </div>
      )}
    </Card>
  );
}

// ─── Empty & loading states ──────────────────────────────────

export function EmptyState({
  icon = "Inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-14 text-center"
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
        <Icon name={icon} className="size-6" />
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

export function CardGridSkeleton({ count = 6, height = "h-40" }: { count?: number; height?: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn(height, "rounded-xl")} />
      ))}
    </div>
  );
}

// ─── Section shell ───────────────────────────────────────────

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-none tracking-tight">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

// ─── Formatting ──────────────────────────────────────────────

/**
 * Dates render in the COMPANY timezone, matching how the server stores and
 * reasons about them — a Cairo user and a UTC-hosted preview must show the same
 * day for the same instant. APP_TIMEZONE is deliberately client-safe (it reads
 * NEXT_PUBLIC_APP_TIMEZONE first), so it is imported rather than re-derived.
 */
const APP_TZ = APP_TIMEZONE;

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ, month: "short", day: "numeric", year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export function formatTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ, hour: "2-digit", minute: "2-digit",
  }).format(d);
}

/** "3 days ago" / "in 2 hours". Relative time needs no timezone. */
export function formatRelative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000], ["month", 2_592_000_000], ["day", 86_400_000],
    ["hour", 3_600_000], ["minute", 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return "just now";
}

/**
 * Convert an instant to the `datetime-local` / `date` input value for the
 * COMPANY zone, so editing a meeting shows the time it was booked for rather
 * than the browser's rendering of the same instant.
 */
export function toLocalInputValue(value: string | Date | null | undefined, withTime = true) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  if (!withTime) return date;
  return `${date}T${String(Number(get("hour")) % 24).padStart(2, "0")}:${get("minute")}`;
}

export { Building2, TrendingUp };
