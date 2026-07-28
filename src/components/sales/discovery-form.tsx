"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Field, Section } from "./lead-dialog";
import { formatDateTime } from "./sales-bits";
import type { SalesAttachment } from "./attachments-panel";
import { AttachmentsPanel } from "./attachments-panel";
import {
  MARKETING_GOALS, SERVICES_CATALOG, SUCCESS_METRICS, MARKETING_CHANNELS,
  BRIEF_STATUS_META,
} from "@/lib/sales-constants";

type Brief = {
  id: string;
  status: string;
  submittedAt: string | null;
  submittedBy: { firstName: string; lastName: string } | null;
  attachments: SalesAttachment[];
  [key: string]: unknown;
};

/**
 * The native discovery brief — the replacement for the Google Form.
 *
 * Saved as a draft as often as the user likes and submitted once; submission is
 * what advances the lead to DISCOVERY, so the two actions are distinct buttons
 * rather than one ambiguous "save".
 */
export function DiscoveryForm({
  leadId,
  brief,
  allBriefs,
  readOnly,
}: {
  leadId: string;
  brief: Brief | null;
  allBriefs: Brief[];
  readOnly?: boolean;
}) {
  const qc = useQueryClient();

  type FormValues = Record<string, string>;
  const { register, handleSubmit, reset } = useForm<FormValues>();

  // Multi-selects live outside react-hook-form: they are chip toggles, not
  // inputs, and keeping them in state makes the toggle logic trivial.
  const [goals, setGoals] = React.useState<string[]>([]);
  const [services, setServices] = React.useState<string[]>([]);
  const [metrics, setMetrics] = React.useState<string[]>([]);
  const [channels, setChannels] = React.useState<string[]>([]);
  const [assets, setAssets] = React.useState<Record<string, boolean>>({});

  const str = React.useCallback(
    (key: string) => (brief?.[key] as string | null) ?? "",
    [brief]
  );

  React.useEffect(() => {
    reset({
      companyName: str("companyName"), brandName: str("brandName"),
      industry: str("industry"), website: str("website"),
      contactPerson: str("contactPerson"), jobTitle: str("jobTitle"),
      phone: str("phone"), email: str("email"),
      businessDescription: str("businessDescription"), products: str("products"),
      services: str("services"), usp: str("usp"), mission: str("mission"), vision: str("vision"),
      goalsOther: str("goalsOther"),
      audienceAge: str("audienceAge"), audienceGender: str("audienceGender"),
      audienceLocation: str("audienceLocation"), audienceIncome: str("audienceIncome"),
      audienceInterests: str("audienceInterests"), audiencePainPoints: str("audiencePainPoints"),
      audienceBuyingBehavior: str("audienceBuyingBehavior"),
      topCompetitors: str("topCompetitors"), brandsAdmired: str("brandsAdmired"),
      competitiveAdvantages: str("competitiveAdvantages"), weaknesses: str("weaknesses"),
      marketingBudget: str("marketingBudget"), previousAgency: str("previousAgency"),
      currentChallenges: str("currentChallenges"), brandPersonality: str("brandPersonality"),
      assetNotes: str("assetNotes"),
      servicesOther: str("servicesOther"), metricsOther: str("metricsOther"),
      additionalNotes: str("additionalNotes"),
    });
    setGoals((brief?.marketingGoals as string[]) ?? []);
    setServices((brief?.servicesRequested as string[]) ?? []);
    setMetrics((brief?.successMetrics as string[]) ?? []);
    setChannels((brief?.channelsUsed as string[]) ?? []);
    setAssets({
      assetLogo: Boolean(brief?.assetLogo),
      assetBrandGuidelines: Boolean(brief?.assetBrandGuidelines),
      assetPhotos: Boolean(brief?.assetPhotos),
      assetVideos: Boolean(brief?.assetVideos),
      assetContentLibrary: Boolean(brief?.assetContentLibrary),
      assetWebsite: Boolean(brief?.assetWebsite),
    });
  }, [brief, reset, str]);

  const save = useMutation({
    mutationFn: ({ values, submit }: { values: FormValues; submit: boolean }) =>
      apiSend(`/api/sales/leads/${leadId}/brief`, "PUT", {
        ...values,
        marketingGoals: goals,
        servicesRequested: services,
        successMetrics: metrics,
        channelsUsed: channels,
        ...assets,
        status: submit ? "SUBMITTED" : "DRAFT",
      }),
    onSuccess: (_r, v) => {
      toast.success(v.submit ? "Discovery brief submitted" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["sales-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["sales-briefs"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submitted = brief?.status === "SUBMITTED";
  const disabled = readOnly || save.isPending;

  return (
    <form className="space-y-4">
      {brief && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div className="flex items-center gap-2">
            <Badge color={BRIEF_STATUS_META[brief.status as "DRAFT" | "SUBMITTED"].color}>
              {BRIEF_STATUS_META[brief.status as "DRAFT" | "SUBMITTED"].label}
            </Badge>
            {submitted && brief.submittedBy && (
              <span className="text-sm text-muted-foreground">
                by {brief.submittedBy.firstName} {brief.submittedBy.lastName} ·{" "}
                {formatDateTime(brief.submittedAt)}
              </span>
            )}
          </div>
          {allBriefs.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {allBriefs.length} versions on record
            </span>
          )}
        </Card>
      )}

      <Card className="space-y-6 p-5">
        <Section title="Company information">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company"><Input {...register("companyName")} disabled={disabled} /></Field>
            <Field label="Brand"><Input {...register("brandName")} disabled={disabled} /></Field>
            <Field label="Industry"><Input {...register("industry")} disabled={disabled} /></Field>
            <Field label="Website"><Input {...register("website")} disabled={disabled} /></Field>
            <Field label="Contact person"><Input {...register("contactPerson")} disabled={disabled} /></Field>
            <Field label="Job title"><Input {...register("jobTitle")} disabled={disabled} /></Field>
            <Field label="Phone"><Input {...register("phone")} disabled={disabled} /></Field>
            <Field label="Email"><Input type="email" {...register("email")} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Business overview">
          <div className="space-y-3">
            <Field label="Business description">
              <Textarea {...register("businessDescription")} rows={3} disabled={disabled} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Products"><Textarea {...register("products")} rows={2} disabled={disabled} /></Field>
              <Field label="Services"><Textarea {...register("services")} rows={2} disabled={disabled} /></Field>
            </div>
            <Field label="Unique selling proposition">
              <Textarea {...register("usp")} rows={2} disabled={disabled} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Mission"><Textarea {...register("mission")} rows={2} disabled={disabled} /></Field>
              <Field label="Vision"><Textarea {...register("vision")} rows={2} disabled={disabled} /></Field>
            </div>
          </div>
        </Section>

        <Section title="Marketing goals">
          <ChipGroup
            options={[...MARKETING_GOALS]}
            selected={goals}
            onChange={setGoals}
            disabled={disabled}
          />
          <div className="mt-3">
            <Field label="Other goals"><Input {...register("goalsOther")} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Target audience">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Age"><Input {...register("audienceAge")} disabled={disabled} /></Field>
            <Field label="Gender"><Input {...register("audienceGender")} disabled={disabled} /></Field>
            <Field label="Location"><Input {...register("audienceLocation")} disabled={disabled} /></Field>
            <Field label="Income"><Input {...register("audienceIncome")} disabled={disabled} /></Field>
            <Field label="Interests"><Textarea {...register("audienceInterests")} rows={2} disabled={disabled} /></Field>
            <Field label="Pain points"><Textarea {...register("audiencePainPoints")} rows={2} disabled={disabled} /></Field>
          </div>
          <div className="mt-3">
            <Field label="Buying behaviour">
              <Textarea {...register("audienceBuyingBehavior")} rows={2} disabled={disabled} />
            </Field>
          </div>
        </Section>

        <Section title="Competitors">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Top competitors"><Textarea {...register("topCompetitors")} rows={2} disabled={disabled} /></Field>
            <Field label="Brands they admire"><Textarea {...register("brandsAdmired")} rows={2} disabled={disabled} /></Field>
            <Field label="Competitive advantages"><Textarea {...register("competitiveAdvantages")} rows={2} disabled={disabled} /></Field>
            <Field label="Weaknesses"><Textarea {...register("weaknesses")} rows={2} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Current marketing">
          <div className="mb-3">
            <div className="mb-1.5 text-sm font-medium">Channels used</div>
            <ChipGroup
              options={[...MARKETING_CHANNELS]}
              selected={channels}
              onChange={setChannels}
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Marketing budget"><Input {...register("marketingBudget")} disabled={disabled} /></Field>
            <Field label="Previous agency"><Input {...register("previousAgency")} disabled={disabled} /></Field>
            <Field label="Current challenges"><Textarea {...register("currentChallenges")} rows={2} disabled={disabled} /></Field>
            <Field label="Brand personality"><Textarea {...register("brandPersonality")} rows={2} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Brand assets">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["assetLogo", "Logo"],
              ["assetBrandGuidelines", "Brand guidelines"],
              ["assetPhotos", "Photos"],
              ["assetVideos", "Videos"],
              ["assetContentLibrary", "Content library"],
              ["assetWebsite", "Website assets"],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(assets[key])}
                  disabled={disabled}
                  onChange={(e) => setAssets((a) => ({ ...a, [key]: e.target.checked }))}
                  className="size-4 rounded border-input accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Field label="Asset notes"><Textarea {...register("assetNotes")} rows={2} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Services requested">
          <ChipGroup
            options={[...SERVICES_CATALOG]}
            selected={services}
            onChange={setServices}
            disabled={disabled}
          />
          <div className="mt-3">
            <Field label="Other services"><Input {...register("servicesOther")} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Success metrics">
          <ChipGroup
            options={[...SUCCESS_METRICS]}
            selected={metrics}
            onChange={setMetrics}
            disabled={disabled}
          />
          <div className="mt-3">
            <Field label="Other metrics"><Input {...register("metricsOther")} disabled={disabled} /></Field>
          </div>
        </Section>

        <Section title="Additional notes">
          <Textarea {...register("additionalNotes")} rows={5} disabled={disabled} />
        </Section>

        {brief && (
          <Section title="Attachments & voice notes">
            <AttachmentsPanel
              parent={{ briefId: brief.id }}
              attachments={brief.attachments}
              invalidateKeys={[["sales-lead", leadId]]}
              readOnly={readOnly}
            />
          </Section>
        )}

        {!readOnly && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={handleSubmit((v) => save.mutate({ values: v, submit: false }))}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save draft
            </Button>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={handleSubmit((v) => save.mutate({ values: v, submit: true }))}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitted ? "Re-submit" : "Submit brief"}
            </Button>
          </div>
        )}
      </Card>
    </form>
  );
}

/** Multi-select rendered as toggle chips — faster to scan than a checkbox list. */
function ChipGroup({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(on ? selected.filter((x) => x !== opt) : [...selected, opt])
            }
            className={`rounded-lg border px-2.5 py-1 text-sm transition-colors disabled:opacity-60 ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
