import { z } from "zod";

/**
 * Zod schemas shared between the sales routes.
 *
 * Kept in one module so a create and its matching patch cannot drift apart:
 * the patch schemas are derived from the create schemas with .partial() rather
 * than being written out a second time.
 */

/** Trim, and treat an empty string as "not provided" rather than as a value. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** Email that also accepts "" from an untouched form field. */
const optionalEmail = z
  .union([z.string().trim().email(), z.literal("")])
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * A wall-clock date or date-time string from the pickers ("2026-08-15" or
 * "2026-08-15T14:30"). Resolved against APP_TIMEZONE by the route via
 * requireUserDateTime — never parsed with `new Date()`, which would silently
 * adopt the server's zone.
 */
const wallClock = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/,
    "Expected YYYY-MM-DD or YYYY-MM-DDTHH:mm"
  );

export const optionalWallClock = z
  .union([wallClock, z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

export const socialLinksSchema = z
  .array(z.object({ platform: z.string().trim().min(1), url: z.string().trim().min(1) }))
  .max(12)
  .optional();

// ─── Required-field helpers (lead intake) ────────────────────
//
// Creating a lead is the start of the CRM workflow, so every field is
// mandatory — a half-filled lead cannot be qualified, forecast or reported on.
//
// Completeness is enforced WITHOUT forcing anyone to invent data: a field whose
// answer genuinely does not exist (a prospect with no website, an unknown
// company size) is recorded explicitly as "N/A". That is a real answer — "we
// asked, there isn't one" — and is distinguishable in reporting from a blank
// that means "nobody has checked yet". Blank is what we refuse.

/** The accepted ways to say "this genuinely does not apply / is not known". */
export const NOT_APPLICABLE = ["n/a", "na", "none", "unknown", "not applicable"];

export function isNotApplicable(value: string | null | undefined) {
  return Boolean(value && NOT_APPLICABLE.includes(value.trim().toLowerCase()));
}

/** Canonical stored form, so filters and reports see one spelling, not five. */
export const NA = "N/A";

/**
 * A required free-text field that accepts an explicit N/A.
 *
 * Normalises any accepted spelling to the canonical "N/A" so a report grouping
 * on the column does not fragment into "na" / "None" / "unknown".
 */
function requiredText(label: string, min = 1) {
  return z
    .string({ required_error: `${label} is required` })
    .trim()
    .min(min, `${label} is required — enter a value or "N/A"`)
    .transform((v) => (isNotApplicable(v) ? NA : v));
}

/** A required email that may be N/A, but must be a real address otherwise. */
const requiredEmail = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(1, 'Email is required — enter an address or "N/A"')
  .transform((v) => (isNotApplicable(v) ? NA : v))
  .refine((v) => v === NA || z.string().email().safeParse(v).success, {
    message: 'Enter a valid email address, or "N/A" if there is none',
  });

/** A required date field; no N/A escape, since a date is either known or picked. */
const requiredWallClock = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, `${label} is required`);

// Set membership for validation, so order carries no meaning here — listed in
// lifecycle order anyway so it reads the same as the pipeline.
export const LEAD_STAGES = [
  "NEW", "CONTACTED", "QUALIFIED", "DISCOVERY", "MEETING_SCHEDULED",
  "PROPOSAL", "NEGOTIATION", "WON", "LOST", "DORMANT",
] as const;

export const LEAD_SOURCES = [
  "REFERRAL", "WEBSITE", "SOCIAL_MEDIA", "COLD_OUTREACH", "EVENT",
  "INBOUND_CALL", "EMAIL_CAMPAIGN", "PARTNER", "ADVERTISING", "OTHER",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export const COMPANY_SIZES = ["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"] as const;
export const MEETING_TYPES = [
  "DISCOVERY_CALL", "INTRO_CALL", "PRESENTATION", "NEGOTIATION",
  "FOLLOW_UP", "ONBOARDING", "OTHER",
] as const;
export const MEETING_LOCATIONS = ["ONLINE", "CLIENT_OFFICE", "OUR_OFFICE", "OTHER"] as const;
export const MEETING_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const DECISION_TIMELINES = [
  "IMMEDIATE", "WITHIN_MONTH", "ONE_TO_THREE_MONTHS",
  "THREE_TO_SIX_MONTHS", "LONGER", "UNKNOWN",
] as const;
export const IDEA_STATUSES = ["NEW", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"] as const;
export const IDEA_IMPACTS = ["LOW", "MEDIUM", "HIGH"] as const;
export const PROPOSAL_EVENT_TYPES = [
  "CREATED", "SENT", "OPENED", "DOWNLOADED", "VIEWED", "REVISED",
  "ACCEPTED", "REJECTED", "CONTRACT_SIGNED", "EXPIRED",
] as const;

// ─── Lead ────────────────────────────────────────────────────

/**
 * Lead intake — every field mandatory.
 *
 * This is the strict schema used on CREATE. Text fields accept an explicit
 * "N/A" (see requiredText) so a salesperson can record that a fact does not
 * exist rather than being blocked by it, but nothing may be left blank.
 *
 * leadPatchSchema below derives from this with .partial(), so later edits stay
 * field-by-field — the completeness rule belongs to intake, not to every
 * subsequent PATCH.
 */
export const leadCreateSchema = z.object({
  companyName: requiredText("Company name"),
  brandName: requiredText("Brand name"),
  contactPerson: requiredText("Contact person"),
  jobTitle: requiredText("Job title"),
  phone: requiredText("Phone number"),
  // Optional, unlike phone: not every prospect is reachable on WhatsApp, and an
  // "N/A" placeholder in a dialable field is worse than an empty one. Carried
  // over to Client.whatsapp when the deal is won.
  whatsapp: optionalText,
  email: requiredEmail,
  website: requiredText("Website"),
  industry: requiredText("Industry"),
  companySize: z.enum(COMPANY_SIZES, {
    required_error: "Company size is required",
    invalid_type_error: "Select a company size",
  }),
  country: requiredText("Country"),
  city: requiredText("City"),
  source: z.enum(LEAD_SOURCES, { required_error: "Lead source is required" }),
  priority: z.enum(PRIORITIES, { required_error: "Priority is required" }),
  stage: z.enum(LEAD_STAGES, { required_error: "Status is required" }),
  /** The owner is who becomes accountable, so a lead is never created ownerless. */
  ownerId: z.string({ required_error: "Lead owner is required" }).min(1, "Lead owner is required"),
  estimatedValue: z
    .number({
      required_error: "Estimated deal value is required",
      invalid_type_error: "Enter the estimated deal value",
    })
    .nonnegative("Deal value cannot be negative")
    .max(1e10),
  expectedCloseDate: requiredWallClock("Expected closing date"),
  probability: z
    .number({
      required_error: "Probability is required",
      invalid_type_error: "Enter a probability between 0 and 100",
    })
    .int()
    .min(0, "Probability cannot be below 0")
    .max(100, "Probability cannot exceed 100"),
  notes: requiredText("Notes"),
  // Not in the required set: tags, social links and the follow-up date are
  // working aids rather than facts about the prospect, and forcing them would
  // only produce placeholder noise.
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  socialLinks: socialLinksSchema,
  nextFollowUpAt: optionalWallClock,
});

/**
 * Patch accepts any subset. `stage` is accepted here but routed through the
 * stage-transition helper rather than written directly, so the history row and
 * the probability default are never skipped.
 *
 * Derived from the create schema, so a field that IS sent still has to satisfy
 * the intake rules — an edit cannot blank out a company name that creation
 * insisted on. Two deliberate relaxations:
 *
 *  - `ownerId` may be null, which is how a manager unassigns a lead. Creation
 *    requires an owner; handing one back to the pool afterwards is legitimate.
 *  - `lostReason` is patch-only: it does not exist at intake, because a lead is
 *    not created already lost.
 */
export const leadPatchSchema = leadCreateSchema.partial().extend({
  ownerId: z.string().min(1).nullable().optional(),
  lostReason: optionalText,
});

export const stageChangeSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  lostReason: optionalText,
  probability: z.number().int().min(0).max(100).optional(),
});

export const convertSchema = z.object({
  /** Defaults to the lead's company name when omitted. */
  clientName: optionalText,
  projectName: optionalText,
  accountManagerId: z.string().optional().nullable(),
  projectManagerId: z.string().optional().nullable(),
  budget: z.number().nonnegative().max(1e10).optional().nullable(),
  startDate: optionalWallClock,
  deadline: optionalWallClock,
});

// ─── Meeting ─────────────────────────────────────────────────

export const meetingCreateSchema = z.object({
  leadId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  type: z.enum(MEETING_TYPES).default("DISCOVERY_CALL"),
  locationType: z.enum(MEETING_LOCATIONS).default("ONLINE"),
  location: optionalText,
  meetingLink: optionalText,
  scheduledAt: wallClock,
  durationMinutes: z.number().int().min(5).max(600).default(60),
  agenda: optionalText,
  preparationNotes: optionalText,
  attendeeIds: z.array(z.string()).max(50).default([]),
});

export const meetingPatchSchema = meetingCreateSchema
  .omit({ leadId: true, scheduledAt: true })
  .partial()
  .extend({
    scheduledAt: wallClock.optional(),
    status: z.enum(MEETING_STATUSES).optional(),
    outcome: optionalText,
  });

export const requirementPatchSchema = z.object({
  key: z.string().min(1),
  done: z.boolean(),
});

// ─── Discovery brief ─────────────────────────────────────────

export const briefSchema = z.object({
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
  // The meeting this brief came out of. Optional, and validated against the
  // lead's own meetings by the route — a brief may not point at a meeting
  // belonging to someone else's lead.
  meetingId: z.string().min(1).optional().nullable(),
  // Company
  companyName: optionalText,
  brandName: optionalText,
  industry: optionalText,
  website: optionalText,
  socialMedia: socialLinksSchema,
  contactPerson: optionalText,
  jobTitle: optionalText,
  phone: optionalText,
  email: optionalEmail,
  // Business overview
  businessDescription: optionalText,
  products: optionalText,
  services: optionalText,
  usp: optionalText,
  mission: optionalText,
  vision: optionalText,
  // Goals
  marketingGoals: z.array(z.string()).max(30).optional(),
  goalsOther: optionalText,
  // Audience
  audienceAge: optionalText,
  audienceGender: optionalText,
  audienceLocation: optionalText,
  audienceIncome: optionalText,
  audienceInterests: optionalText,
  audiencePainPoints: optionalText,
  audienceBuyingBehavior: optionalText,
  // Competitors
  topCompetitors: optionalText,
  brandsAdmired: optionalText,
  competitiveAdvantages: optionalText,
  weaknesses: optionalText,
  // Current marketing
  channelsUsed: z.array(z.string()).max(30).optional(),
  marketingBudget: optionalText,
  previousAgency: optionalText,
  currentChallenges: optionalText,
  brandPersonality: optionalText,
  // Assets
  assetLogo: z.boolean().optional(),
  assetBrandGuidelines: z.boolean().optional(),
  assetPhotos: z.boolean().optional(),
  assetVideos: z.boolean().optional(),
  assetContentLibrary: z.boolean().optional(),
  assetWebsite: z.boolean().optional(),
  assetNotes: optionalText,
  // Services & metrics
  servicesRequested: z.array(z.string()).max(30).optional(),
  servicesOther: optionalText,
  successMetrics: z.array(z.string()).max(30).optional(),
  metricsOther: optionalText,
  additionalNotes: optionalText,
});

// ─── Sales feedback ──────────────────────────────────────────

const factor5 = z.number().int().min(1).max(5).optional().nullable();

export const feedbackSchema = z.object({
  leadId: z.string().min(1),
  meetingId: z.string().optional().nullable(),
  meetingDate: optionalWallClock,
  meetingType: z.enum(MEETING_TYPES).optional().nullable(),
  stage: z.enum(LEAD_STAGES).optional().nullable(),
  // Scoring factors
  budgetFit: factor5,
  decisionMakerPresent: z.boolean().default(false),
  clientUrgency: factor5,
  engagementLevel: factor5,
  meetingOutcome: factor5,
  followUpCommitment: z.boolean().default(false),
  businessFit: factor5,
  opportunityStrength: z.number().int().min(1).max(10).optional().nullable(),
  closingProbability: z.number().int().min(0).max(100).optional().nullable(),
  decisionTimeline: z.enum(DECISION_TIMELINES).default("UNKNOWN"),
  finalDecisionMaker: optionalText,
  clientPersonality: optionalText,
  objections: optionalText,
  buyingSignals: optionalText,
  operationalRisks: optionalText,
  proposalRecommendations: optionalText,
  servicesRecommended: z.array(z.string()).max(30).default([]),
  nextAction: optionalText,
  nextMeetingDate: optionalWallClock,
  internalNotes: optionalText,
});

export const feedbackPatchSchema = feedbackSchema.omit({ leadId: true }).partial();

// ─── Proposal ────────────────────────────────────────────────

export const proposalCreateSchema = z.object({
  leadId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  summary: optionalText,
  amount: z.number().nonnegative().max(1e10).optional().nullable(),
  currency: z.string().trim().min(1).max(8).default("EGP"),
  validUntil: optionalWallClock,
  /** Marks this as a revision of the lead's current proposal. */
  isRevision: z.boolean().default(false),
});

export const proposalPatchSchema = proposalCreateSchema
  .omit({ leadId: true, isRevision: true })
  .partial()
  .extend({ rejectionReason: optionalText });

export const proposalEventSchema = z.object({
  type: z.enum(PROPOSAL_EVENT_TYPES),
  note: optionalText,
});

// ─── Ideas ───────────────────────────────────────────────────

export const ideaCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: optionalText,
  category: optionalText,
  leadId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  estimatedImpact: z.enum(IDEA_IMPACTS).default("MEDIUM"),
  status: z.enum(IDEA_STATUSES).default("NEW"),
  ownerId: z.string().optional().nullable(),
});

export const ideaPatchSchema = ideaCreateSchema.partial();

export const ideaConvertSchema = z.object({
  target: z.enum(["task", "project"]),
  /** Required for a project; a task may hang off the related client instead. */
  clientId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).max(20).default([]),
  deadline: optionalWallClock,
});

// ─── Comments ────────────────────────────────────────────────

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(10_000),
  mentions: z.array(z.string()).max(50).default([]),
});
