import type {
  BriefStatus,
  CompanySize,
  DecisionTimeline,
  IdeaImpact,
  IdeaStatus,
  LeadPriority,
  LeadSource,
  LeadStage,
  MeetingLocationType,
  MeetingStatus,
  MeetingType,
  OpportunityTemperature,
  ProposalEventType,
  ProposalStatus,
} from "@prisma/client";

/**
 * Display metadata for the sales domain.
 *
 * Deliberately separate from lib/sales.ts: that module is "server-only" (it
 * touches the database), while these maps are needed by client components. Same
 * split as lib/constants.ts versus lib/tasks.ts.
 *
 * Colours are drawn from the palette already used by TASK_STATUS_META so the
 * Sales workspace reads as the same product, and status hues stay reserved
 * (green = good, red = lost, amber = attention).
 */

export const LEAD_STAGE_META: Record<
  LeadStage,
  { label: string; color: string; group: "open" | "closed" }
> = {
  NEW: { label: "New", color: "#64748B", group: "open" },
  CONTACTED: { label: "Contacted", color: "#0EA5E9", group: "open" },
  QUALIFIED: { label: "Qualified", color: "#06B6D4", group: "open" },
  MEETING_SCHEDULED: { label: "Meeting Scheduled", color: "#8B5CF6", group: "open" },
  DISCOVERY: { label: "Discovery", color: "#8B5CF6", group: "open" },
  PROPOSAL: { label: "Proposal", color: "#F59E0B", group: "open" },
  NEGOTIATION: { label: "Negotiation", color: "#F97316", group: "open" },
  WON: { label: "Won", color: "#22C55E", group: "closed" },
  LOST: { label: "Lost", color: "#EF4444", group: "closed" },
  DORMANT: { label: "Dormant", color: "#94A3B8", group: "closed" },
};

/** Every stage, in lifecycle order — used by filters and the funnel report. */
export const LEAD_STAGE_ORDER: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "DORMANT",
];

/**
 * Columns on the Kanban board — every stage, in lifecycle order.
 *
 * This must stay exhaustive over LeadStage: the board buckets leads by exact
 * stage match, so any stage without a column would silently hide the leads
 * sitting in it. CONTACTED, MEETING_SCHEDULED and DORMANT are all reachable
 * from the lead dialog and the detail view, so they each need a home here.
 * Mirrors PIPELINE_STAGES in lib/sales.ts; kept here for client use.
 */
export const PIPELINE_COLUMNS: LeadStage[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "DISCOVERY",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "DORMANT",
];

export const LEAD_PRIORITY_META: Record<LeadPriority, { label: string; color: string }> = {
  LOW: { label: "Low", color: "#64748B" },
  MEDIUM: { label: "Medium", color: "#0EA5E9" },
  HIGH: { label: "High", color: "#F59E0B" },
  URGENT: { label: "Urgent", color: "#EF4444" },
};

export const LEAD_SOURCE_META: Record<LeadSource, { label: string }> = {
  REFERRAL: { label: "Referral" },
  WEBSITE: { label: "Website" },
  SOCIAL_MEDIA: { label: "Social Media" },
  COLD_OUTREACH: { label: "Cold Outreach" },
  EVENT: { label: "Event" },
  INBOUND_CALL: { label: "Inbound Call" },
  EMAIL_CAMPAIGN: { label: "Email Campaign" },
  PARTNER: { label: "Partner" },
  ADVERTISING: { label: "Advertising" },
  OTHER: { label: "Other" },
};

export const COMPANY_SIZE_META: Record<CompanySize, { label: string }> = {
  MICRO: { label: "1–9 employees" },
  SMALL: { label: "10–49 employees" },
  MEDIUM: { label: "50–199 employees" },
  LARGE: { label: "200–999 employees" },
  ENTERPRISE: { label: "1000+ employees" },
};

export const MEETING_TYPE_META: Record<MeetingType, { label: string }> = {
  DISCOVERY_CALL: { label: "Discovery Call" },
  INTRO_CALL: { label: "Intro Call" },
  PRESENTATION: { label: "Presentation" },
  NEGOTIATION: { label: "Negotiation" },
  FOLLOW_UP: { label: "Follow-up" },
  ONBOARDING: { label: "Onboarding" },
  OTHER: { label: "Other" },
};

export const MEETING_STATUS_META: Record<MeetingStatus, { label: string; color: string }> = {
  SCHEDULED: { label: "Scheduled", color: "#0EA5E9" },
  COMPLETED: { label: "Completed", color: "#22C55E" },
  CANCELLED: { label: "Cancelled", color: "#64748B" },
  NO_SHOW: { label: "No Show", color: "#EF4444" },
};

export const MEETING_LOCATION_META: Record<MeetingLocationType, { label: string }> = {
  ONLINE: { label: "Online" },
  CLIENT_OFFICE: { label: "Client Office" },
  OUR_OFFICE: { label: "Our Office" },
  OTHER: { label: "Other" },
};

export const BRIEF_STATUS_META: Record<BriefStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#F59E0B" },
  SUBMITTED: { label: "Submitted", color: "#22C55E" },
};

export const TEMPERATURE_META: Record<
  OpportunityTemperature,
  { label: string; color: string; icon: string }
> = {
  COLD: { label: "Cold", color: "#64748B", icon: "Snowflake" },
  WARM: { label: "Warm", color: "#0EA5E9", icon: "Thermometer" },
  HOT: { label: "Hot", color: "#F59E0B", icon: "Flame" },
  VERY_HOT: { label: "Very Hot", color: "#EF4444", icon: "Flame" },
};

export const DECISION_TIMELINE_META: Record<DecisionTimeline, { label: string }> = {
  IMMEDIATE: { label: "Immediate" },
  WITHIN_MONTH: { label: "Within a month" },
  ONE_TO_THREE_MONTHS: { label: "1–3 months" },
  THREE_TO_SIX_MONTHS: { label: "3–6 months" },
  LONGER: { label: "More than 6 months" },
  UNKNOWN: { label: "Unknown" },
};

export const PROPOSAL_STATUS_META: Record<ProposalStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#64748B" },
  SENT: { label: "Sent", color: "#0EA5E9" },
  VIEWED: { label: "Viewed", color: "#8B5CF6" },
  UNDER_REVISION: { label: "Under Revision", color: "#F59E0B" },
  ACCEPTED: { label: "Accepted", color: "#22C55E" },
  REJECTED: { label: "Rejected", color: "#EF4444" },
  EXPIRED: { label: "Expired", color: "#94A3B8" },
};

export const PROPOSAL_EVENT_META: Record<ProposalEventType, { label: string; icon: string }> = {
  CREATED: { label: "Created", icon: "FilePlus" },
  SENT: { label: "Sent to client", icon: "Send" },
  OPENED: { label: "Opened by client", icon: "MailOpen" },
  DOWNLOADED: { label: "Downloaded", icon: "Download" },
  VIEWED: { label: "Viewed", icon: "Eye" },
  REVISED: { label: "Revised", icon: "RefreshCw" },
  ACCEPTED: { label: "Accepted", icon: "CheckCircle2" },
  REJECTED: { label: "Rejected", icon: "XCircle" },
  CONTRACT_SIGNED: { label: "Contract signed", icon: "PenLine" },
  EXPIRED: { label: "Expired", icon: "Clock" },
};

export const IDEA_STATUS_META: Record<IdeaStatus, { label: string; color: string }> = {
  NEW: { label: "New", color: "#64748B" },
  UNDER_REVIEW: { label: "Under Review", color: "#0EA5E9" },
  APPROVED: { label: "Approved", color: "#22C55E" },
  REJECTED: { label: "Rejected", color: "#EF4444" },
  IMPLEMENTED: { label: "Implemented", color: "#8B5CF6" },
};

export const IDEA_IMPACT_META: Record<IdeaImpact, { label: string; color: string }> = {
  LOW: { label: "Low", color: "#64748B" },
  MEDIUM: { label: "Medium", color: "#0EA5E9" },
  HIGH: { label: "High", color: "#22C55E" },
};

/**
 * Timeline verb → how it renders. Keys match SALES_ACTIVITY in lib/sales.ts.
 * Kept as data so stored history never has to be rewritten when wording changes.
 */
export const SALES_ACTIVITY_META: Record<string, { label: string; icon: string; color: string }> = {
  "lead.created": { label: "Lead created", icon: "Sparkles", color: "#06B6D4" },
  "lead.updated": { label: "Lead updated", icon: "Pencil", color: "#64748B" },
  "lead.assigned": { label: "Lead assigned", icon: "UserPlus", color: "#8B5CF6" },
  "lead.stage_changed": { label: "Stage changed", icon: "ArrowRightLeft", color: "#0EA5E9" },
  "meeting.scheduled": { label: "Meeting scheduled", icon: "CalendarPlus", color: "#8B5CF6" },
  "meeting.updated": { label: "Meeting updated", icon: "CalendarClock", color: "#64748B" },
  "meeting.completed": { label: "Meeting completed", icon: "CalendarCheck", color: "#22C55E" },
  "meeting.cancelled": { label: "Meeting cancelled", icon: "CalendarX", color: "#EF4444" },
  "discovery.submitted": { label: "Discovery submitted", icon: "ClipboardCheck", color: "#06B6D4" },
  "feedback.submitted": { label: "Feedback submitted", icon: "MessageSquareText", color: "#0EA5E9" },
  "proposal.created": { label: "Proposal created", icon: "FilePlus", color: "#64748B" },
  "proposal.sent": { label: "Proposal sent", icon: "Send", color: "#0EA5E9" },
  "proposal.opened": { label: "Proposal opened", icon: "MailOpen", color: "#8B5CF6" },
  "proposal.accepted": { label: "Proposal accepted", icon: "CheckCircle2", color: "#22C55E" },
  "proposal.rejected": { label: "Proposal rejected", icon: "XCircle", color: "#EF4444" },
  "comment.added": { label: "Comment added", icon: "MessageCircle", color: "#64748B" },
  "file.uploaded": { label: "File uploaded", icon: "Paperclip", color: "#64748B" },
  "lead.won": { label: "Deal won", icon: "Trophy", color: "#22C55E" },
  "lead.lost": { label: "Deal lost", icon: "XCircle", color: "#EF4444" },
  "lead.converted": { label: "Converted to client", icon: "Building2", color: "#22C55E" },
};

/** Fallback so an unknown verb still renders rather than crashing the timeline. */
export const DEFAULT_ACTIVITY_META = { label: "Activity", icon: "Circle", color: "#64748B" };

// ── Discovery brief option catalogs ──────────────────────────
// Stored as String[] on DiscoveryBrief; these are the pickable values.

export const MARKETING_GOALS = [
  "Increase Awareness",
  "Generate Leads",
  "Increase Sales",
  "Build Loyalty",
  "Launch Product",
  "Grow Social Media",
  "Enter New Market",
] as const;

export const SERVICES_CATALOG = [
  "Social Media",
  "Branding",
  "Paid Media",
  "Production",
  "SEO",
  "Website",
  "Strategy",
  "Influencers",
] as const;

export const SUCCESS_METRICS = [
  "Sales",
  "Leads",
  "Reach",
  "Engagement",
  "Traffic",
  "Awareness",
  "ROI",
] as const;

export const MARKETING_CHANNELS = [
  "Facebook",
  "Instagram",
  "TikTok",
  "LinkedIn",
  "YouTube",
  "Google Ads",
  "Email",
  "Print",
  "Outdoor",
  "Events",
] as const;

/** Format a money amount for display. Amounts arrive as numbers from the API. */
export function formatMoney(value: number | null | undefined, currency = "EGP") {
  if (value === null || value === undefined) return "—";
  return `${currency} ${Math.round(value).toLocaleString("en-US")}`;
}

/** Compact form for KPI tiles: 1.2M / 340K. */
export function formatCompactMoney(value: number | null | undefined, currency = "EGP") {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${currency} ${Math.round(value / 1_000)}K`;
  return `${currency} ${Math.round(value)}`;
}
