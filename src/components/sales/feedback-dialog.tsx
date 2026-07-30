"use client";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, Section } from "./lead-dialog";
import { todayInputMin, notInThePast } from "@/lib/utils";
import { TemperatureBadge } from "./sales-bits";
import { scoreOpportunity, SCORE_FACTOR_LABELS } from "@/lib/opportunity-score";
import {
  MEETING_TYPE_META, DECISION_TIMELINE_META, LEAD_STAGE_ORDER, LEAD_STAGE_META,
  SERVICES_CATALOG, TEMPERATURE_META,
} from "@/lib/sales-constants";
import type { LeadStage } from "@prisma/client";

/**
 * The post-meeting debrief.
 *
 * The opportunity score is previewed live from the same function the server
 * uses to persist it (lib/opportunity-score.ts), so what the salesperson sees
 * while filling the form is exactly what gets stored.
 */
export function FeedbackDialog({
  open,
  onClose,
  leadId,
  meetings,
  stage,
  leadPickerLeads,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  meetings?: { id: string; title: string; scheduledAt: string }[];
  stage?: LeadStage;
  leadPickerLeads?: { id: string; code: string; companyName: string }[];
}) {
  const qc = useQueryClient();

  type FormValues = {
    leadId: string;
    meetingId: string;
    meetingDate: string;
    meetingType: string;
    stage: string;
    budgetFit: string;
    clientUrgency: string;
    engagementLevel: string;
    meetingOutcome: string;
    businessFit: string;
    decisionMakerPresent: boolean;
    followUpCommitment: boolean;
    opportunityStrength: string;
    closingProbability: string;
    decisionTimeline: string;
    finalDecisionMaker: string;
    clientPersonality: string;
    objections: string;
    buyingSignals: string;
    operationalRisks: string;
    proposalRecommendations: string;
    nextAction: string;
    nextMeetingDate: string;
    internalNotes: string;
  };

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormValues>();
  const [services, setServices] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    reset({
      leadId: leadId ?? "",
      meetingId: "",
      meetingDate: "",
      meetingType: "DISCOVERY_CALL",
      stage: stage ?? "DISCOVERY",
      budgetFit: "", clientUrgency: "", engagementLevel: "",
      meetingOutcome: "", businessFit: "",
      decisionMakerPresent: false,
      followUpCommitment: false,
      opportunityStrength: "",
      closingProbability: "",
      decisionTimeline: "UNKNOWN",
      finalDecisionMaker: "", clientPersonality: "", objections: "",
      buyingSignals: "", operationalRisks: "", proposalRecommendations: "",
      nextAction: "", nextMeetingDate: "", internalNotes: "",
    });
    setServices([]);
  }, [open, leadId, stage, reset]);

  // Watching the scoring fields drives the live preview.
  const watched = useWatch({ control });
  const preview = React.useMemo(
    () =>
      scoreOpportunity({
        budgetFit: num(watched.budgetFit),
        clientUrgency: num(watched.clientUrgency),
        engagementLevel: num(watched.engagementLevel),
        meetingOutcome: num(watched.meetingOutcome),
        businessFit: num(watched.businessFit),
        decisionMakerPresent: Boolean(watched.decisionMakerPresent),
        followUpCommitment: Boolean(watched.followUpCommitment),
        opportunityStrength: num(watched.opportunityStrength),
      }),
    [watched]
  );

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      apiSend("/api/sales/feedback", "POST", {
        leadId: v.leadId,
        meetingId: v.meetingId || null,
        meetingDate: v.meetingDate || null,
        meetingType: v.meetingType || null,
        stage: v.stage || null,
        budgetFit: num(v.budgetFit),
        clientUrgency: num(v.clientUrgency),
        engagementLevel: num(v.engagementLevel),
        meetingOutcome: num(v.meetingOutcome),
        businessFit: num(v.businessFit),
        decisionMakerPresent: Boolean(v.decisionMakerPresent),
        followUpCommitment: Boolean(v.followUpCommitment),
        opportunityStrength: num(v.opportunityStrength),
        closingProbability: num(v.closingProbability),
        decisionTimeline: v.decisionTimeline,
        finalDecisionMaker: v.finalDecisionMaker || undefined,
        clientPersonality: v.clientPersonality || undefined,
        objections: v.objections || undefined,
        buyingSignals: v.buyingSignals || undefined,
        operationalRisks: v.operationalRisks || undefined,
        proposalRecommendations: v.proposalRecommendations || undefined,
        servicesRecommended: services,
        nextAction: v.nextAction || undefined,
        nextMeetingDate: v.nextMeetingDate || null,
        internalNotes: v.internalNotes || undefined,
      }),
    onSuccess: () => {
      toast.success("Feedback submitted");
      qc.invalidateQueries({ queryKey: ["sales-lead"] });
      qc.invalidateQueries({ queryKey: ["sales-feedback"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Sales feedback"
      description="Debrief the meeting. The opportunity score is calculated from your answers."
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5">
        {/* live score */}
        <div
          className="flex items-center justify-between rounded-xl border p-4"
          style={{
            borderColor: `${TEMPERATURE_META[preview.temperature].color}55`,
            backgroundColor: `${TEMPERATURE_META[preview.temperature].color}0F`,
          }}
        >
          <div>
            <div className="text-xs font-medium text-muted-foreground">Opportunity score</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-3xl font-bold tabular-nums">{preview.score}</span>
              <TemperatureBadge temperature={preview.temperature} />
            </div>
          </div>
          <p className="max-w-[240px] text-right text-[11px] text-muted-foreground">
            Calculated from budget fit, decision maker, urgency, engagement,
            outcome, follow-up and business fit.
          </p>
        </div>

        {!leadId && (
          <Field label="Lead" required>
            <Select {...register("leadId", { required: true })}>
              <option value="">Select a lead…</option>
              {(leadPickerLeads ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.companyName} ({l.code})</option>
              ))}
            </Select>
          </Field>
        )}

        <Section title="Meeting">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {meetings && meetings.length > 0 && (
              <Field label="Related meeting" hint="Required to mark a meeting completed">
                <Select {...register("meetingId")}>
                  <option value="">Not linked</option>
                  {meetings.map((m) => (
                    <option key={m.id} value={m.id}>{m.title}</option>
                  ))}
                </Select>
              </Field>
            )}
            {/* Deliberately NOT bounded to today: this records when a meeting
                that has already happened took place, so a past date is the
                normal case. The future-date rule applies to scheduling fields
                (Next meeting date, below), not to historical ones. */}
            <Field label="Meeting date"><Input type="date" {...register("meetingDate")} /></Field>
            <Field label="Meeting type">
              <Select {...register("meetingType")}>
                {Object.entries(MEETING_TYPE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Current stage">
              <Select {...register("stage")}>
                {LEAD_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Scoring factors">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(SCORE_FACTOR_LABELS).map(([key, meta]) => (
              <Field key={key} label={meta.label} hint={meta.hint}>
                <Select {...register(key as keyof FormValues)}>
                  <option value="">Not assessed</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} — {ratingWord(n)}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("decisionMakerPresent")}
                className="size-4 rounded border-input accent-primary"
              />
              Decision maker was present
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("followUpCommitment")}
                className="size-4 rounded border-input accent-primary"
              />
              Client committed to a follow-up
            </label>
          </div>
        </Section>

        <Section title="Your assessment">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Opportunity strength" hint="1–10, blended at 30%">
              <Input type="number" min={1} max={10} {...register("opportunityStrength")} />
            </Field>
            <Field label="Closing probability %" hint="Updates the lead">
              <Input type="number" min={0} max={100} {...register("closingProbability")} />
            </Field>
            <Field label="Decision timeline">
              <Select {...register("decisionTimeline")}>
                {Object.entries(DECISION_TIMELINE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>
          </div>
        </Section>

        <Section title="Client read">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Final decision maker"><Input {...register("finalDecisionMaker")} /></Field>
            <Field label="Client personality"><Input {...register("clientPersonality")} /></Field>
            <Field label="Objections"><Textarea {...register("objections")} rows={2} /></Field>
            <Field label="Buying signals"><Textarea {...register("buyingSignals")} rows={2} /></Field>
            <Field label="Operational risks"><Textarea {...register("operationalRisks")} rows={2} /></Field>
            <Field label="Proposal recommendations"><Textarea {...register("proposalRecommendations")} rows={2} /></Field>
          </div>
        </Section>

        <Section title="Services recommended">
          <div className="flex flex-wrap gap-1.5">
            {SERVICES_CATALOG.map((s) => {
              const on = services.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setServices((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]))
                  }
                  className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Next steps">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Next action"><Input {...register("nextAction")} /></Field>
            <Field label="Next meeting date" hint="Becomes the lead's follow-up date" error={errors.nextMeetingDate}>
              <Input
                type="date"
                min={todayInputMin()}
                {...register("nextMeetingDate", { validate: notInThePast("Next meeting date") })}
                aria-invalid={Boolean(errors.nextMeetingDate)}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Internal notes"><Textarea {...register("internalNotes")} rows={3} /></Field>
          </div>
        </Section>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Submit feedback
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** "" → null so an unanswered factor is excluded from the score, not scored 0. */
function num(v: unknown): number | null {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratingWord(n: number) {
  return ["Very poor", "Poor", "Average", "Good", "Excellent"][n - 1];
}
