"use client";
import * as React from "react";
import { useForm, type FieldError, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Loader2, X } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, todayInputMin, notInThePast } from "@/lib/utils";
import {
  LEAD_STAGE_ORDER, LEAD_STAGE_META, LEAD_SOURCE_META, LEAD_PRIORITY_META,
  COMPANY_SIZE_META,
} from "@/lib/sales-constants";
import { NA, isNotApplicable } from "@/lib/sales-schemas";
import { toLocalInputValue, type LeadListItem } from "./sales-bits";
import type { SalesMeta } from "./use-sales-meta";

/**
 * Create / edit a lead.
 *
 * One dialog for both, because the field set is identical — a separate edit
 * form would be the same 25 inputs maintained twice.
 *
 * Validation differs by mode, deliberately:
 *  - CREATE enforces every field, mirroring leadCreateSchema. A lead is the
 *    start of the CRM workflow and an incomplete one cannot be qualified,
 *    forecast or reported on.
 *  - EDIT validates only what is filled in, so correcting one field does not
 *    force a re-check of the whole record.
 *
 * The rules below mirror the Zod schema rather than replacing it: the server
 * revalidates everything, and these exist to give the message inline instead of
 * as a toast after a round trip.
 */
export function LeadDialog({
  open,
  onClose,
  lead,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  lead?: LeadListItem | null;
  meta?: SalesMeta;
}) {
  const qc = useQueryClient();
  const editing = Boolean(lead);

  type FormValues = {
    companyName: string;
    brandName: string;
    contactPerson: string;
    jobTitle: string;
    email: string;
    phone: string;
    whatsapp: string;
    website: string;
    industry: string;
    companySize: string;
    country: string;
    city: string;
    source: string;
    priority: string;
    stage: string;
    ownerId: string;
    estimatedValue: string;
    probability: string;
    expectedCloseDate: string;
    nextFollowUpAt: string;
    notes: string;
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    // Validate as the user goes, so the disabled submit button is explainable
    // rather than mysterious.
    mode: "onChange",
  });

  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  // Reset whenever the dialog opens or the target lead changes, so a second
  // open never shows the previous lead's values.
  React.useEffect(() => {
    if (!open) return;
    reset({
      companyName: lead?.companyName ?? "",
      brandName: lead?.brandName ?? "",
      contactPerson: lead?.contactPerson ?? "",
      jobTitle: lead?.jobTitle ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      whatsapp: lead?.whatsapp ?? "",
      website: lead?.website ?? "",
      industry: lead?.industry ?? "",
      companySize: "",
      country: lead?.country ?? "",
      city: lead?.city ?? "",
      source: lead?.source ?? "",
      priority: lead?.priority ?? "MEDIUM",
      stage: lead?.stage ?? "NEW",
      // On create the owner defaults to nobody so the field must be answered
      // consciously — it decides who is accountable for the deal.
      ownerId: lead?.owner?.id ?? "",
      estimatedValue: lead?.estimatedValue != null ? String(lead.estimatedValue) : "",
      probability: lead ? String(lead.probability) : "",
      expectedCloseDate: toLocalInputValue(lead?.expectedCloseDate, false),
      nextFollowUpAt: toLocalInputValue(lead?.nextFollowUpAt, false),
      notes: "",
    });
    setTags(lead?.tags ?? []);
    setTagInput("");
  }, [open, lead, reset]);

  /**
   * Validation rules for a mandatory text field.
   *
   * Only applied on create; on edit the field is optional so a partial update
   * stays possible. "N/A" is accepted as a real answer — see the schema.
   */
  const req = (label: string) =>
    editing
      ? {}
      : { required: `${label} is required — enter a value or "N/A"` };

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      // On create every field is present by construction. On edit, blanks mean
      // "leave alone" and are dropped rather than sent as empty strings, which
      // would fail the schema or wipe a stored value.
      const keep = (value: string) => (editing ? value || undefined : value);

      const payload: Record<string, unknown> = {
        companyName: keep(v.companyName),
        brandName: keep(v.brandName),
        contactPerson: keep(v.contactPerson),
        jobTitle: keep(v.jobTitle),
        email: keep(v.email),
        phone: keep(v.phone),
        whatsapp: v.whatsapp || undefined,
        website: keep(v.website),
        industry: keep(v.industry),
        companySize: v.companySize || undefined,
        country: keep(v.country),
        city: keep(v.city),
        source: v.source || undefined,
        priority: v.priority || undefined,
        stage: v.stage || undefined,
        notes: keep(v.notes),
        tags,
        nextFollowUpAt: v.nextFollowUpAt || null,
        expectedCloseDate: editing ? v.expectedCloseDate || undefined : v.expectedCloseDate,
      };

      // Numbers: "" is absent, not zero — sending 0 would silently zero a deal.
      if (v.estimatedValue !== "") payload.estimatedValue = Number(v.estimatedValue);
      else if (!editing) payload.estimatedValue = undefined;
      if (v.probability !== "") payload.probability = Number(v.probability);

      // Only send ownerId when the user may actually assign, so a member's edit
      // does not trip the Sales.Assign check. On create the schema requires it,
      // and a member's own id is what the field is pre-filled with.
      if (meta?.permissions.canAssign || !editing) payload.ownerId = v.ownerId || null;

      return editing
        ? apiSend(`/api/sales/leads/${lead!.id}`, "PATCH", payload)
        : apiSend("/api/sales/leads", "POST", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Lead updated" : "Lead created");
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-lead", lead?.id] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  }

  // Whether the owner picker is editable. A member creating a lead owns it.
  const canPickOwner = meta?.permissions.canAssign ?? false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${lead!.companyName}` : "New lead"}
      description={
        editing
          ? lead!.code
          : 'Every field is required. Enter "N/A" where something genuinely does not exist.'
      }
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-5" noValidate>
        <Section title="Company">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name" required={!editing} error={errors.companyName}>
              <Input
                {...register("companyName", req("Company name"))}
                autoFocus
                aria-invalid={Boolean(errors.companyName)}
              />
            </Field>
            <Field label="Brand name" required={!editing} error={errors.brandName}>
              <Input {...register("brandName", req("Brand name"))} aria-invalid={Boolean(errors.brandName)} />
            </Field>
            <Field label="Industry" required={!editing} error={errors.industry}>
              <Input
                {...register("industry", req("Industry"))}
                placeholder="e.g. Retail, F&B"
                aria-invalid={Boolean(errors.industry)}
              />
            </Field>
            <Field label="Company size" required={!editing} error={errors.companySize}>
              <Select
                {...register("companySize", editing ? {} : { required: "Company size is required" })}
                aria-invalid={Boolean(errors.companySize)}
              >
                <option value="">Select…</option>
                {Object.entries(COMPANY_SIZE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field
              label="Website"
              required={!editing}
              error={errors.website}
              hint='Enter "N/A" if they have no website'
            >
              <Input
                {...register("website", req("Website"))}
                placeholder="https://"
                aria-invalid={Boolean(errors.website)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Country" required={!editing} error={errors.country}>
                <Input {...register("country", req("Country"))} aria-invalid={Boolean(errors.country)} />
              </Field>
              <Field label="City" required={!editing} error={errors.city}>
                <Input {...register("city", req("City"))} aria-invalid={Boolean(errors.city)} />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Primary contact">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact person" required={!editing} error={errors.contactPerson}>
              <Input {...register("contactPerson", req("Contact person"))} aria-invalid={Boolean(errors.contactPerson)} />
            </Field>
            <Field label="Job title" required={!editing} error={errors.jobTitle}>
              <Input {...register("jobTitle", req("Job title"))} aria-invalid={Boolean(errors.jobTitle)} />
            </Field>
            <Field
              label="Email"
              required={!editing}
              error={errors.email}
              hint='A real address, or "N/A"'
            >
              <Input
                type="text"
                {...register("email", {
                  ...req("Email"),
                  // Mirrors requiredEmail in the schema: N/A passes, anything
                  // else must look like an address.
                  validate: (v: string) =>
                    !v || isNotApplicable(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
                      ? true
                      : 'Enter a valid email address, or "N/A" if there is none',
                })}
                aria-invalid={Boolean(errors.email)}
              />
            </Field>
            <Field label="Phone number" required={!editing} error={errors.phone}>
              <Input {...register("phone", req("Phone number"))} aria-invalid={Boolean(errors.phone)} />
            </Field>
            {/* Optional, unlike the other contact fields: not every prospect
                uses WhatsApp, and it carries over to the client on a win. */}
            <Field label="WhatsApp" hint="Optional">
              <Input {...register("whatsapp")} />
            </Field>
          </div>
        </Section>

        <Section title="Pipeline">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Status" required={!editing} error={errors.stage}>
              <Select {...register("stage", editing ? {} : { required: "Status is required" })}>
                {LEAD_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" required={!editing} error={errors.priority}>
              <Select {...register("priority", editing ? {} : { required: "Priority is required" })}>
                {Object.entries(LEAD_PRIORITY_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Lead source" required={!editing} error={errors.source}>
              <Select
                {...register("source", editing ? {} : { required: "Lead source is required" })}
                aria-invalid={Boolean(errors.source)}
              >
                <option value="">Select…</option>
                {Object.entries(LEAD_SOURCE_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>

            <Field
              label="Lead owner"
              required={!editing}
              error={errors.ownerId}
              hint={canPickOwner ? undefined : "You will own this lead"}
            >
              <Select
                {...register("ownerId", editing ? {} : { required: "Lead owner is required" })}
                disabled={!canPickOwner && editing}
                aria-invalid={Boolean(errors.ownerId)}
              >
                <option value="">Select…</option>
                {(meta?.salespeople ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </Select>
            </Field>

            <Field label="Estimated deal value" required={!editing} error={errors.estimatedValue}>
              <Input
                type="number"
                min={0}
                step="100"
                {...register("estimatedValue", {
                  ...(editing ? {} : { required: "Estimated deal value is required" }),
                  min: { value: 0, message: "Deal value cannot be negative" },
                })}
                aria-invalid={Boolean(errors.estimatedValue)}
              />
            </Field>
            <Field label="Probability %" required={!editing} error={errors.probability}>
              <Input
                type="number"
                min={0}
                max={100}
                {...register("probability", {
                  ...(editing ? {} : { required: "Probability is required" }),
                  min: { value: 0, message: "Probability cannot be below 0" },
                  max: { value: 100, message: "Probability cannot exceed 100" },
                })}
                aria-invalid={Boolean(errors.probability)}
              />
            </Field>
            <Field label="Expected closing date" required={!editing} error={errors.expectedCloseDate}>
              <Input
                type="date"
                min={todayInputMin()}
                {...register("expectedCloseDate", {
                  ...(editing ? {} : { required: "Expected closing date is required" }),
                  validate: notInThePast("Expected closing date"),
                })}
                aria-invalid={Boolean(errors.expectedCloseDate)}
              />
            </Field>
            <Field label="Next follow-up" hint="Optional" error={errors.nextFollowUpAt}>
              <Input
                type="date"
                min={todayInputMin()}
                {...register("nextFollowUpAt", { validate: notInThePast("Next follow-up") })}
                aria-invalid={Boolean(errors.nextFollowUpAt)}
              />
            </Field>
          </div>
        </Section>

        <Section title="Tags & notes">
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">
                Tags <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} className="gap-1">
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      aria-label={`Remove tag ${t}`}
                      className="rounded hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter must not submit the form while adding a tag.
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  onBlur={addTag}
                  placeholder="Add tag…"
                  className="h-8 w-32"
                />
              </div>
            </div>
            <Field
              label="Notes"
              required={!editing}
              error={errors.notes}
              hint='Context for whoever picks this up. Enter "N/A" if there is nothing to add.'
            >
              <Textarea {...register("notes", req("Notes"))} rows={3} aria-invalid={Boolean(errors.notes)} />
            </Field>
          </div>
        </Section>

        {/* A single summary above the button, so the reason a disabled submit
            stays disabled is visible without hunting for the red field. */}
        {!editing && Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              {Object.keys(errors).length} field
              {Object.keys(errors).length === 1 ? "" : "s"} still need
              {Object.keys(errors).length === 1 ? "s" : ""} attention. Every field is
              required — use <span className="font-medium">{NA}</span> where something
              genuinely does not exist.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || (!editing && !isValid)}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Create lead"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  /** react-hook-form error for this field; renders in place of the hint. */
  error?: FieldError;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
          <AlertCircle className="size-3 shrink-0" />
          {error.message}
        </p>
      ) : (
        hint && <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export type { UseFormRegisterReturn };
