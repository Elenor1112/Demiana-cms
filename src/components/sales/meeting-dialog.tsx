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
import { Avatar } from "@/components/ui/avatar";
import { Field } from "./lead-dialog";
import { useSalesMeta } from "./use-sales-meta";
import { todayDateTimeMin, notInThePast } from "@/lib/utils";
import { toLocalInputValue } from "./sales-bits";
import {
  MEETING_TYPE_META, MEETING_LOCATION_META, MEETING_STATUS_META,
} from "@/lib/sales-constants";

type MeetingInput = {
  id: string; title: string; type: string; locationType: string;
  location: string | null; meetingLink: string | null; scheduledAt: string;
  durationMinutes: number; agenda: string | null; preparationNotes: string | null;
  status: string;
  attendees: { user: { id: string } }[];
};

/** Schedule or edit a meeting. One dialog for both, like LeadDialog. */
export function MeetingDialog({
  open,
  onClose,
  leadId,
  meeting,
  leadPickerLeads,
}: {
  open: boolean;
  onClose: () => void;
  /** Fixed lead when opened from a lead page; omitted on the Meetings index. */
  leadId?: string;
  meeting?: MeetingInput | null;
  leadPickerLeads?: { id: string; code: string; companyName: string }[];
}) {
  const qc = useQueryClient();
  const { data: meta } = useSalesMeta();
  const editing = Boolean(meeting);

  type FormValues = {
    leadId: string;
    title: string;
    type: string;
    locationType: string;
    location: string;
    meetingLink: string;
    scheduledAt: string;
    durationMinutes: string;
    agenda: string;
    preparationNotes: string;
    status: string;
  };

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>();
  const [attendeeIds, setAttendeeIds] = React.useState<string[]>([]);
  const locationType = watch("locationType");

  React.useEffect(() => {
    if (!open) return;
    reset({
      leadId: leadId ?? "",
      title: meeting?.title ?? "",
      type: meeting?.type ?? "DISCOVERY_CALL",
      locationType: meeting?.locationType ?? "ONLINE",
      location: meeting?.location ?? "",
      meetingLink: meeting?.meetingLink ?? "",
      // Rendered in the company zone so an edit shows the booked time, not the
      // browser's rendering of the same instant.
      scheduledAt: toLocalInputValue(meeting?.scheduledAt) || defaultSlot(),
      durationMinutes: String(meeting?.durationMinutes ?? 60),
      agenda: meeting?.agenda ?? "",
      preparationNotes: meeting?.preparationNotes ?? "",
      status: meeting?.status ?? "SCHEDULED",
    });
    setAttendeeIds(meeting?.attendees.map((a) => a.user.id) ?? []);
  }, [open, meeting, leadId, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const payload = {
        title: v.title,
        type: v.type,
        locationType: v.locationType,
        location: v.location || undefined,
        meetingLink: v.meetingLink || undefined,
        scheduledAt: v.scheduledAt,
        durationMinutes: Number(v.durationMinutes) || 60,
        agenda: v.agenda || undefined,
        preparationNotes: v.preparationNotes || undefined,
        attendeeIds,
      };
      return editing
        ? apiSend(`/api/sales/meetings/${meeting!.id}`, "PATCH", { ...payload, status: v.status })
        : apiSend("/api/sales/meetings", "POST", { ...payload, leadId: v.leadId });
    },
    onSuccess: () => {
      toast.success(editing ? "Meeting updated" : "Meeting scheduled");
      qc.invalidateQueries({ queryKey: ["sales-lead"] });
      qc.invalidateQueries({ queryKey: ["sales-meetings"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leadOptions = leadPickerLeads ?? meta?.leads ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit meeting" : "Schedule meeting"}
      description={
        editing
          ? undefined
          : "A preparation checklist is created automatically with every meeting."
      }
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        {!leadId && !editing && (
          <Field label="Lead" required>
            <Select {...register("leadId", { required: true })}>
              <option value="">Select a lead…</option>
              {leadOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.companyName} ({l.code})</option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Title" required>
            <Input {...register("title", { required: true })} autoFocus placeholder="e.g. Discovery call" />
          </Field>
          <Field label="Type">
            <Select {...register("type")}>
              {Object.entries(MEETING_TYPE_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </Select>
          </Field>
          {/* A meeting is scheduled, never back-dated: the past-date guard here
              matches requireFutureDateTime on the API. */}
          <Field label="Date & time" required error={errors.scheduledAt}>
            <Input
              type="datetime-local"
              min={todayDateTimeMin()}
              {...register("scheduledAt", {
                required: true,
                validate: notInThePast("Meeting date"),
              })}
              aria-invalid={Boolean(errors.scheduledAt)}
            />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={5} max={600} step={5} {...register("durationMinutes")} />
          </Field>
          <Field label="Location type">
            <Select {...register("locationType")}>
              {Object.entries(MEETING_LOCATION_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </Select>
          </Field>
          {/* An online meeting wants a link; anywhere else wants an address. */}
          {locationType === "ONLINE" ? (
            <Field label="Meeting link">
              <Input {...register("meetingLink")} placeholder="https://meet.google.com/…" />
            </Field>
          ) : (
            <Field label="Address">
              <Input {...register("location")} />
            </Field>
          )}
          {editing && (
            <Field label="Status" hint="Completing requires submitted feedback">
              <Select {...register("status")}>
                {Object.entries(MEETING_STATUS_META).map(([k, m]) => (
                  <option key={k} value={k}>{m.label}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Field label="Agenda">
          <Textarea {...register("agenda")} rows={3} placeholder="What will be covered…" />
        </Field>
        <Field label="Preparation notes">
          <Textarea {...register("preparationNotes")} rows={2} />
        </Field>

        <div>
          <div className="mb-1.5 text-sm font-medium">Internal attendees</div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
            {(meta?.users ?? []).map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  checked={attendeeIds.includes(u.id)}
                  onChange={(e) =>
                    setAttendeeIds((prev) =>
                      e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)
                    )
                  }
                  className="size-4 rounded border-input accent-primary"
                />
                <Avatar firstName={u.firstName} lastName={u.lastName} src={u.avatarUrl} size={20} />
                <span className="truncate">{u.firstName} {u.lastName}</span>
                {u.jobTitle && (
                  <span className="truncate text-xs text-muted-foreground">{u.jobTitle}</span>
                )}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            You are added automatically as the organizer.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Schedule"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Next full hour, as a sensible default rather than an empty required field. */
function defaultSlot() {
  const d = new Date(Date.now() + 3600_000);
  d.setMinutes(0, 0, 0);
  return toLocalInputValue(d);
}
