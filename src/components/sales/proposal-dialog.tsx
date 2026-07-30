"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./lead-dialog";
import { todayInputMin, notInThePast } from "@/lib/utils";
import { toLocalInputValue } from "./sales-bits";

/**
 * Create a proposal, or a revision of an existing one.
 *
 * A revision is a NEW row at the next version rather than an edit, so the
 * acceptance history of each version stays intact — `revisionOf` only seeds
 * the fields and sets the isRevision flag.
 */
export function ProposalDialog({
  open,
  onClose,
  leadId,
  revisionOf,
  leadPickerLeads,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string;
  revisionOf?: {
    id: string; version: number; title: string; summary: string | null;
    amount: number | null; currency: string; validUntil: string | null;
  } | null;
  leadPickerLeads?: { id: string; code: string; companyName: string }[];
}) {
  const qc = useQueryClient();

  type FormValues = {
    leadId: string;
    title: string;
    summary: string;
    amount: string;
    currency: string;
    validUntil: string;
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>();

  React.useEffect(() => {
    if (!open) return;
    reset({
      leadId: leadId ?? "",
      title: revisionOf?.title ?? "",
      summary: revisionOf?.summary ?? "",
      amount: revisionOf?.amount != null ? String(revisionOf.amount) : "",
      currency: revisionOf?.currency ?? "EGP",
      validUntil: toLocalInputValue(revisionOf?.validUntil, false),
    });
  }, [open, revisionOf, leadId, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      apiSend("/api/sales/proposals", "POST", {
        leadId: v.leadId,
        title: v.title,
        summary: v.summary || undefined,
        amount: v.amount ? Number(v.amount) : null,
        currency: v.currency || "EGP",
        validUntil: v.validUntil || null,
        isRevision: Boolean(revisionOf),
      }),
    onSuccess: () => {
      toast.success(revisionOf ? "Revision created" : "Proposal created");
      qc.invalidateQueries({ queryKey: ["sales-lead"] });
      qc.invalidateQueries({ queryKey: ["sales-proposals"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={revisionOf ? `New revision of v${revisionOf.version}` : "New proposal"}
      description={
        revisionOf
          ? "Creates the next version. The previous version stays on record with its own history."
          : "Track the proposal through send, open, accept and contract."
      }
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
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

        <Field label="Title" required>
          <Input {...register("title", { required: true })} autoFocus placeholder="e.g. Social media retainer — Q3" />
        </Field>
        <Field label="Summary">
          <Textarea {...register("summary")} rows={4} placeholder="Scope, deliverables, terms…" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Amount">
              <Input type="number" min={0} step="100" {...register("amount")} />
            </Field>
          </div>
          <Field label="Currency">
            <Input {...register("currency")} maxLength={8} />
          </Field>
        </div>
        <Field label="Valid until" error={errors.validUntil}>
          <Input
            type="date"
            min={todayInputMin()}
            {...register("validUntil", { validate: notInThePast("Valid until") })}
            aria-invalid={Boolean(errors.validUntil)}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {revisionOf ? "Create revision" : "Create proposal"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
