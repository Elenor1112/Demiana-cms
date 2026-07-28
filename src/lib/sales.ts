import "server-only";
import { db } from "./db";
import { can, canSeeSalesModule, salesScope, type SalesScope, type SessionUser } from "./rbac";
import { ApiError } from "./api";
import { notifyMany } from "./notify";
import { zonedParts, requireUserDateTime, APP_TIMEZONE } from "./timezone";
import type { LeadStage, Prisma, ProposalEventType } from "@prisma/client";

/**
 * Sales domain rules.
 *
 * Everything that more than one route needs to agree on lives here: who can see
 * which leads, how a stage change is recorded, how an opportunity is scored, and
 * what the pipeline is worth. Routes stay thin request/response adapters.
 */

// ─── Visibility ──────────────────────────────────────────────

/**
 * Rows a user is allowed to see, as a Prisma filter.
 *
 * Returns undefined when no filter is needed (full access) so callers can
 * spread it, matching taskVisibilityFilter's contract in lib/tasks.ts.
 * Throws for users with no sales access at all, rather than silently returning
 * an empty list — a 403 is the honest answer.
 */
export function leadVisibilityFilter(user: SessionUser): Prisma.LeadWhereInput | undefined {
  const scope = salesScope(user);
  switch (scope.kind) {
    case "all":
      return undefined;
    case "own":
      // Creator is included alongside owner so a member who logs a lead does not
      // lose sight of it the moment a manager reassigns ownership.
      return { OR: [{ ownerId: scope.userId }, { createdById: scope.userId }] };
    case "converted":
      // Account Management sees the history only once the deal is closed.
      return { convertedClientId: { not: null } };
    case "none":
      throw new ApiError(403, "You do not have access to the Sales workspace.");
  }
}

/**
 * Require Sales workspace access, or throw 403.
 *
 * The API-side twin of the /sales layout guard. Applied to every endpoint that
 * serves the workspace itself — the pipeline, the dashboard, reports, the
 * activity feed — so a user without the module cannot reach that data by
 * calling the API directly.
 *
 * Deliberately NOT applied to /api/sales/clients or the per-lead reads, which
 * must keep answering for Account Management's `converted` scope: those are the
 * post-handover history, not the live pipeline.
 */
export function requireSalesModule(user: SessionUser): SessionUser {
  if (!canSeeSalesModule(user)) {
    throw new ApiError(403, "You do not have access to the Sales workspace.");
  }
  return user;
}

/** Whether this user may see this specific lead. */
export async function canViewLead(user: SessionUser, leadId: string) {
  const filter = leadVisibilityFilter(user);
  if (!filter) return true;
  const found = await db.lead.findFirst({
    where: { id: leadId, ...filter },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Load a lead the user is allowed to see, or throw.
 *
 * Every per-lead route starts with this, so a lead outside the caller's scope
 * is a clean 404 rather than a leak of its existence through a 403.
 */
export async function requireVisibleLead(user: SessionUser, leadId: string) {
  const filter = leadVisibilityFilter(user);
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...filter },
    select: {
      id: true,
      code: true,
      companyName: true,
      stage: true,
      ownerId: true,
      createdById: true,
      convertedClientId: true,
      probability: true,
      estimatedValue: true,
    },
  });
  if (!lead) throw new ApiError(404, "Lead not found.");
  return lead;
}

/**
 * Whether the user may MODIFY this lead, as opposed to merely reading it.
 *
 * Read scope is not enough: a sales member can see their own leads and edit
 * them, but Account Management's `converted` scope is deliberately read-only —
 * closed deals are history, not live records.
 */
export function assertCanEditLead(
  user: SessionUser,
  lead: { ownerId: string | null; createdById: string },
  permission: "Sales.LeadEdit" | "Sales.ChangeStage" | "Sales.MeetingManage" |
    "Sales.DiscoverySubmit" | "Sales.FeedbackSubmit" | "Sales.ProposalManage" = "Sales.LeadEdit"
) {
  if (user.isSuperAdmin) return;
  if (!can(user, permission)) throw new ApiError(403, `Missing permission: ${permission}`);
  // Holders of Sales.ViewAll (the manager) may edit anything they can see.
  if (can(user, "Sales.ViewAll")) return;
  const isOwn = lead.ownerId === user.id || lead.createdById === user.id;
  if (!isOwn) throw new ApiError(403, "You can only work on leads assigned to you.");
}

// ─── Codes ───────────────────────────────────────────────────

/**
 * Generate the next lead code, e.g. LEAD-143.
 *
 * Mirrors nextTaskCode: derived from the most recent row rather than a
 * sequence, which keeps it readable and consistent with how Task codes work.
 */
export async function nextLeadCode(): Promise<string> {
  const last = await db.lead.findFirst({
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });
  const lastNum = last?.code?.match(/(\d+)$/)?.[1];
  const next = lastNum ? parseInt(lastNum, 10) + 1 : 101;
  return `LEAD-${next}`;
}

// ─── Stage machine ───────────────────────────────────────────

/** Stages that mean the deal is finished, either way. */
export const CLOSED_STAGES: LeadStage[] = ["WON", "LOST"];

/**
 * Stages where the deal is still live.
 *
 * "Open pipeline" appears in the dashboard, the reports, the team page and
 * every performance metric; defining it once means a new stage cannot be added
 * to some of those and forgotten in the rest.
 */
export const OPEN_STAGES: LeadStage[] = [
  "NEW", "CONTACTED", "QUALIFIED", "MEETING_SCHEDULED",
  "DISCOVERY", "PROPOSAL", "NEGOTIATION",
];

/** Stages shown as pipeline columns, in order. Excludes DORMANT and the
 *  intermediate CONTACTED / MEETING_SCHEDULED, which the board folds into their
 *  neighbours to keep seven readable columns. */
export const PIPELINE_STAGES: LeadStage[] = [
  "NEW",
  "QUALIFIED",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

/**
 * Default probability for each stage, used when a lead moves and the user has
 * not set an explicit probability. Reflects a normal agency funnel.
 */
const STAGE_PROBABILITY: Record<LeadStage, number> = {
  NEW: 5,
  CONTACTED: 10,
  QUALIFIED: 25,
  MEETING_SCHEDULED: 35,
  DISCOVERY: 45,
  PROPOSAL: 60,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
  DORMANT: 0,
};

export function stageProbability(stage: LeadStage) {
  return STAGE_PROBABILITY[stage];
}

/**
 * Field updates that must accompany a stage transition.
 *
 * wonAt / lostAt are write-once like Task.startedAt: a lead that bounces out of
 * WON and back keeps its original close date, so cycle-time reporting is stable.
 */
export function stageTransition(
  current: { stage: LeadStage; probability: number; wonAt: Date | null; lostAt: Date | null },
  nextStage: LeadStage,
  opts: { lostReason?: string | null; probability?: number } = {},
  now: Date = new Date()
): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = { stage: nextStage };

  // An explicit probability always wins; otherwise adopt the stage default, but
  // only when the user has not already tuned it away from the previous default.
  if (opts.probability !== undefined) {
    data.probability = opts.probability;
  } else if (current.probability === STAGE_PROBABILITY[current.stage] || CLOSED_STAGES.includes(nextStage)) {
    data.probability = STAGE_PROBABILITY[nextStage];
  }

  if (nextStage === "WON" && !current.wonAt) data.wonAt = now;
  if (nextStage === "LOST" && !current.lostAt) data.lostAt = now;
  if (nextStage === "LOST" && opts.lostReason !== undefined) data.lostReason = opts.lostReason;
  // Leaving a closed stage clears the follow-up expectation rather than leaving
  // a stale overdue marker on the dashboard.
  if (CLOSED_STAGES.includes(nextStage)) data.nextFollowUpAt = null;

  return data;
}

// ─── Opportunity scoring ─────────────────────────────────────

/**
 * Scoring lives in lib/opportunity-score.ts, not here.
 *
 * This module is server-only (it touches the database), but the feedback form
 * needs the same formula to show the score updating live as it is filled in.
 * Re-exported so API routes still import everything sales-related from one
 * place, while there remains exactly ONE implementation of the maths.
 */
export {
  scoreOpportunity,
  temperatureFor,
  SCORE_WEIGHTS,
  type ScoreFactors,
} from "./opportunity-score";

// ─── Meeting requirements catalog ────────────────────────────

/**
 * The pre-meeting readiness checklist, seeded onto every new meeting.
 *
 * A fixed catalog rather than free-form items so completion rates are
 * comparable across meetings and salespeople — that comparison is the point of
 * tracking it at all.
 */
export const MEETING_REQUIREMENTS: { key: string; label: string }[] = [
  { key: "company_researched", label: "Company researched" },
  { key: "website_reviewed", label: "Website reviewed" },
  { key: "social_reviewed", label: "Social media reviewed" },
  { key: "competitors_analyzed", label: "Competitors analyzed" },
  { key: "previous_notes_reviewed", label: "Previous notes reviewed" },
  { key: "portfolio_prepared", label: "Portfolio prepared" },
  { key: "proposal_template_ready", label: "Proposal template ready" },
  { key: "pricing_prepared", label: "Pricing prepared" },
  { key: "decision_maker_identified", label: "Decision maker identified" },
  { key: "attendees_confirmed", label: "Required attendees confirmed" },
];

// ─── Activity ────────────────────────────────────────────────

/**
 * Stable activity verbs. Stored as keys and rendered through SALES_ACTIVITY_META
 * (lib/sales-constants.ts) so the wording can change without rewriting history.
 */
export const SALES_ACTIVITY = {
  LEAD_CREATED: "lead.created",
  LEAD_UPDATED: "lead.updated",
  LEAD_ASSIGNED: "lead.assigned",
  STAGE_CHANGED: "lead.stage_changed",
  MEETING_SCHEDULED: "meeting.scheduled",
  MEETING_UPDATED: "meeting.updated",
  MEETING_COMPLETED: "meeting.completed",
  MEETING_CANCELLED: "meeting.cancelled",
  DISCOVERY_SUBMITTED: "discovery.submitted",
  FEEDBACK_SUBMITTED: "feedback.submitted",
  PROPOSAL_CREATED: "proposal.created",
  PROPOSAL_SENT: "proposal.sent",
  PROPOSAL_OPENED: "proposal.opened",
  PROPOSAL_ACCEPTED: "proposal.accepted",
  PROPOSAL_REJECTED: "proposal.rejected",
  COMMENT_ADDED: "comment.added",
  FILE_UPLOADED: "file.uploaded",
  WON: "lead.won",
  LOST: "lead.lost",
  CLIENT_CONVERTED: "lead.converted",
} as const;

export type SalesVerb = (typeof SALES_ACTIVITY)[keyof typeof SALES_ACTIVITY];

/**
 * Append an entry to a lead's timeline and refresh its lastActivityAt.
 *
 * Both writes happen together so the denormalized column can never fall behind
 * the timeline it summarises.
 */
export async function logSalesActivity(opts: {
  leadId: string;
  actorId?: string | null;
  verb: SalesVerb;
  summary?: string;
  meta?: Record<string, unknown>;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  await db.$transaction([
    db.salesActivity.create({
      data: {
        leadId: opts.leadId,
        actorId: opts.actorId ?? null,
        verb: opts.verb,
        summary: opts.summary,
        meta: opts.meta as object | undefined,
        createdAt: at,
      },
    }),
    db.lead.update({ where: { id: opts.leadId }, data: { lastActivityAt: at } }),
  ]);
}

// ─── Notifications ───────────────────────────────────────────

/**
 * Everyone who should hear about something happening on a lead: its owner plus
 * every sales manager, minus whoever performed the action.
 *
 * Managers are resolved by PERMISSION rather than by role key, so granting
 * Sales.ViewAll to an individual automatically includes them in manager alerts
 * without a code change — the "do not hardcode permissions" requirement.
 */
export async function salesWatchers(opts: {
  ownerId?: string | null;
  excludeActorId?: string;
  includeManagers?: boolean;
}): Promise<string[]> {
  const ids = new Set<string>();
  if (opts.ownerId) ids.add(opts.ownerId);

  if (opts.includeManagers !== false) {
    const managers = await db.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role: { isSuperAdmin: true } },
          { role: { permissions: { some: { permission: { key: "Sales.ViewAll" } } } } },
          { permissions: { some: { effect: "ALLOW", permission: { key: "Sales.ViewAll" } } } },
        ],
      },
      select: { id: true },
    });
    for (const m of managers) ids.add(m.id);
  }

  if (opts.excludeActorId) ids.delete(opts.excludeActorId);
  return [...ids];
}

/** Notify a lead's watchers. Thin wrapper so routes do not repeat the fan-out. */
export async function notifySales(opts: {
  ownerId?: string | null;
  excludeActorId?: string;
  includeManagers?: boolean;
  type: Parameters<typeof notifyMany>[1]["type"];
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
}) {
  const recipients = await salesWatchers(opts);
  if (!recipients.length) return;
  await notifyMany(recipients, {
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link,
    meta: opts.meta,
  });
}

// ─── Proposal events ─────────────────────────────────────────

/**
 * Timestamp columns kept in step with each proposal event type.
 *
 * The Proposal row carries denormalized timestamps so list views need no
 * aggregate over the event log; this map is the single place that defines how
 * an event updates them.
 */
export function proposalEventUpdate(
  type: ProposalEventType,
  current: { openedAt: Date | null; viewCount: number; revisionCount: number },
  now: Date = new Date()
): Prisma.ProposalUpdateInput {
  switch (type) {
    case "SENT":
      return { status: "SENT", sentAt: now };
    case "OPENED":
      // openedAt is FIRST open only; viewedAt tracks the latest.
      return {
        status: "VIEWED",
        openedAt: current.openedAt ?? now,
        viewedAt: now,
        viewCount: current.viewCount + 1,
      };
    case "VIEWED":
      return { status: "VIEWED", viewedAt: now, viewCount: current.viewCount + 1 };
    case "DOWNLOADED":
      return { downloadedAt: now };
    case "REVISED":
      return { status: "UNDER_REVISION", revisionCount: current.revisionCount + 1 };
    case "ACCEPTED":
      return { status: "ACCEPTED", acceptedAt: now };
    case "REJECTED":
      return { status: "REJECTED", rejectedAt: now };
    case "CONTRACT_SIGNED":
      return { contractSignedAt: now };
    case "EXPIRED":
      return { status: "EXPIRED" };
    case "CREATED":
      return {};
  }
}

// ─── Date boundaries ─────────────────────────────────────────

/**
 * Day / month boundaries anchored in the COMPANY timezone.
 *
 * Built from server-local parts these land on the wrong instant on a UTC host,
 * which is the bug the analytics route documents: "today" and "overdue" were
 * being counted against a boundary hours off the office day. Every sales
 * aggregate resolves its ranges through here so there is one correct
 * implementation rather than one per route.
 */
export function companyDayStart(offsetDays = 0, from: Date = new Date()): Date {
  const p = zonedParts(from);
  const base = requireUserDateTime(
    `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    "dayStart"
  );
  return offsetDays ? new Date(base.getTime() + offsetDays * 86_400_000) : base;
}

/** First instant of the month `offsetMonths` away from `from`, company zone. */
export function companyMonthStart(offsetMonths = 0, from: Date = new Date()): Date {
  const p = zonedParts(from);
  const m0 = p.month - 1 + offsetMonths;
  const year = p.year + Math.floor(m0 / 12);
  const month = ((m0 % 12) + 12) % 12 + 1;
  return requireUserDateTime(`${year}-${String(month).padStart(2, "0")}-01`, "monthStart");
}

/** Short month label for chart axes, rendered in the company zone. */
export function monthLabel(instant: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, month: "short" }).format(instant);
}

// ─── Pipeline maths ──────────────────────────────────────────

/**
 * Weighted forecast for a set of leads: Σ(value × probability).
 *
 * Decimal columns come back as Prisma.Decimal, whose valueOf() is a string —
 * summing them with + would concatenate. Number() is applied per row for that
 * reason, not as a stylistic choice.
 */
export function weightedValue(leads: { estimatedValue: Prisma.Decimal | null; probability: number }[]) {
  return leads.reduce(
    (sum, l) => sum + Number(l.estimatedValue ?? 0) * (l.probability / 100),
    0
  );
}

export function totalValue(leads: { estimatedValue: Prisma.Decimal | null }[]) {
  return leads.reduce((sum, l) => sum + Number(l.estimatedValue ?? 0), 0);
}

/** Scope helper re-exported so routes import one module. */
export { salesScope, type SalesScope };
