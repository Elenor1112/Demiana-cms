"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "./lead-dialog";
import type { SalesMeta } from "./use-sales-meta";

/**
 * Convert a won lead into a client and an opening project.
 *
 * The dialog only collects what cannot be derived: who owns the account, who
 * runs the project, and the project dates. Everything else — company details,
 * contact, budget — is carried over server-side, which is the "no manual
 * re-entry" requirement.
 */
export function ConvertDialog({
  open,
  onClose,
  lead,
  meta,
}: {
  open: boolean;
  onClose: () => void;
  lead: {
    id: string;
    code: string;
    companyName: string;
    brandName: string | null;
    estimatedValue: number | null;
  };
  meta?: SalesMeta;
}) {
  const router = useRouter();
  const qc = useQueryClient();

  type FormValues = {
    clientName: string;
    projectName: string;
    accountManagerId: string;
    projectManagerId: string;
    budget: string;
    startDate: string;
    deadline: string;
  };

  const { register, handleSubmit, reset } = useForm<FormValues>();

  React.useEffect(() => {
    if (!open) return;
    reset({
      clientName: lead.companyName,
      projectName: `${lead.brandName || lead.companyName} — Onboarding`,
      accountManagerId: "",
      projectManagerId: "",
      budget: lead.estimatedValue != null ? String(lead.estimatedValue) : "",
      startDate: "",
      deadline: "",
    });
  }, [open, lead, reset]);

  const convert = useMutation({
    mutationFn: (v: FormValues) =>
      apiSend<{ client: { id: string; company: string }; project: { id: string; name: string } }>(
        `/api/sales/leads/${lead.id}/convert`,
        "POST",
        {
          clientName: v.clientName || undefined,
          projectName: v.projectName || undefined,
          accountManagerId: v.accountManagerId || null,
          projectManagerId: v.projectManagerId || null,
          budget: v.budget ? Number(v.budget) : null,
          startDate: v.startDate || null,
          deadline: v.deadline || null,
        }
      ),
    onSuccess: (res) => {
      toast.success(`${res.client.company} is now a client`);
      qc.invalidateQueries({ queryKey: ["sales-lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-clients"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
      router.push(`/projects/${res.project.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const people = meta?.users ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Convert ${lead.companyName} to a client`}
      description="Creates the client and an opening project. The discovery brief, feedback, proposals and full timeline stay linked to this lead."
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit((v) => convert.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client name" required>
            <Input {...register("clientName", { required: true })} autoFocus />
          </Field>
          <Field label="Project name" required>
            <Input {...register("projectName", { required: true })} />
          </Field>
          <Field label="Account manager" hint="Gains access to this account">
            <Select {...register("accountManagerId")}>
              <option value="">Not assigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}{p.jobTitle ? ` — ${p.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project manager" hint="Becomes the project lead">
            <Select {...register("projectManagerId")}>
              <option value="">Not assigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}{p.jobTitle ? ` — ${p.jobTitle}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project budget" hint="Defaults to the deal value">
            <Input type="number" min={0} step="100" {...register("budget")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date"><Input type="date" {...register("startDate")} /></Field>
            <Field label="Deadline"><Input type="date" {...register("deadline")} /></Field>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
          The lead stays in the pipeline as a permanent record and links to the new
          client, so its discovery brief, feedback and proposal history remain
          available from both sides.
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={convert.isPending}>
            {convert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Convert to client
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
