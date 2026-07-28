import type { OpportunityTemperature } from "@prisma/client";

/**
 * Opportunity scoring — the single implementation, shared by client and server.
 *
 * Deliberately NOT in lib/sales.ts: that module is "server-only" because it
 * touches the database, and the feedback form needs to show the score updating
 * live as the salesperson fills it in. Duplicating the formula would guarantee
 * the preview and the stored value eventually disagree, so the pure maths lives
 * here and lib/sales.ts re-exports it for the API.
 */

/**
 * Weights for the automatic opportunity score. They sum to 100 so the result is
 * directly a percentage — no normalisation step to get wrong.
 */
export const SCORE_WEIGHTS = {
  budgetFit: 20,
  decisionMakerPresent: 15,
  clientUrgency: 15,
  engagementLevel: 15,
  meetingOutcome: 15,
  followUpCommitment: 10,
  businessFit: 10,
} as const;

/** Human labels for the 1–5 factors, used by the form. */
export const SCORE_FACTOR_LABELS: Record<string, { label: string; hint: string }> = {
  budgetFit: { label: "Budget fit", hint: "Does their budget match our pricing?" },
  clientUrgency: { label: "Client urgency", hint: "How soon do they need to start?" },
  engagementLevel: { label: "Engagement", hint: "How responsive and involved were they?" },
  meetingOutcome: { label: "Meeting outcome", hint: "How well did the meeting go?" },
  businessFit: { label: "Business fit", hint: "How well do they fit our ideal client?" },
};

export type ScoreFactors = {
  budgetFit?: number | null;
  decisionMakerPresent?: boolean | null;
  clientUrgency?: number | null;
  engagementLevel?: number | null;
  meetingOutcome?: number | null;
  followUpCommitment?: boolean | null;
  businessFit?: number | null;
  /** Salesperson's own 1–10 read, blended in when supplied. */
  opportunityStrength?: number | null;
};

/**
 * Compute a 0–100 opportunity score from the structured feedback factors.
 *
 * The 1–5 factors are scaled to their weight; the two booleans score all or
 * nothing. Unanswered factors are EXCLUDED from the denominator rather than
 * counted as zero — a half-filled form should not read as a cold lead, it
 * should read as whatever the answered questions say.
 *
 * When the salesperson supplies their own 1–10 strength it is blended at 30%,
 * so human judgment moves the number without overriding the evidence.
 */
export function scoreOpportunity(f: ScoreFactors): {
  score: number;
  temperature: OpportunityTemperature;
} {
  let earned = 0;
  let available = 0;

  const scale5 = (value: number | null | undefined, weight: number) => {
    if (value === null || value === undefined) return;
    available += weight;
    // 1→0%, 5→100% of the weight.
    earned += ((Math.min(5, Math.max(1, value)) - 1) / 4) * weight;
  };

  scale5(f.budgetFit, SCORE_WEIGHTS.budgetFit);
  scale5(f.clientUrgency, SCORE_WEIGHTS.clientUrgency);
  scale5(f.engagementLevel, SCORE_WEIGHTS.engagementLevel);
  scale5(f.meetingOutcome, SCORE_WEIGHTS.meetingOutcome);
  scale5(f.businessFit, SCORE_WEIGHTS.businessFit);

  if (f.decisionMakerPresent !== null && f.decisionMakerPresent !== undefined) {
    available += SCORE_WEIGHTS.decisionMakerPresent;
    if (f.decisionMakerPresent) earned += SCORE_WEIGHTS.decisionMakerPresent;
  }
  if (f.followUpCommitment !== null && f.followUpCommitment !== undefined) {
    available += SCORE_WEIGHTS.followUpCommitment;
    if (f.followUpCommitment) earned += SCORE_WEIGHTS.followUpCommitment;
  }

  // Nothing answered at all — an honest zero, flagged COLD.
  let score = available === 0 ? 0 : Math.round((earned / available) * 100);

  if (f.opportunityStrength !== null && f.opportunityStrength !== undefined && available > 0) {
    const manual = (Math.min(10, Math.max(1, f.opportunityStrength)) / 10) * 100;
    score = Math.round(score * 0.7 + manual * 0.3);
  }

  return { score, temperature: temperatureFor(score) };
}

export function temperatureFor(score: number): OpportunityTemperature {
  if (score >= 80) return "VERY_HOT";
  if (score >= 60) return "HOT";
  if (score >= 35) return "WARM";
  return "COLD";
}
