"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save, Send } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./lead-dialog";
import { formatDateTime } from "./sales-bits";
import { MEETING_TYPE_META } from "@/lib/sales-constants";
import type { SalesMeta } from "./use-sales-meta";
import type { MeetingStatus, MeetingType } from "@prisma/client";

type MeetingOption = {
  id: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  scheduledAt: string;
};

/**
 * Quick discovery brief, started from the Discovery page rather than from inside
 * a lead.
 *
 * The long-form brief still lives on the lead's Discovery tab; this is the short
 * path a salesperson takes straight out of a meeting — pick the lead, pick which
 * of that lead's meetings it came from, type the brief. Both write to the same
 * upsert endpoint, so a brief started here can be finished in full there.
 *
 * Lead and meeting options are read live from the sales meta query and the
 * meetings API, so the dropdowns always match Sales > Leads and Sales > Meetings.
 */
export function BriefDialog({
  open,
  onClose,
  meta,
  defaultLeadId,
}: {
  open: boolean;
  onClose: () => void;
  meta: SalesMeta | undefined;
  defaultLeadId?: string;
}) {
  const qc = useQueryClient();

  const [leadId, setLeadId] = React.useState(defaultLeadId ?? "");
  const [meetingId, setMeetingId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Reopening the dialog starts a clean sheet rather than inheriting the last
  // brief's text, which would be easy to submit against the wrong lead.
  React.useEffect(() => {
    if (open) {
      setLeadId(defaultLeadId ?? "");
      setMeetingId("");
      setNotes("");
      setError(null);
    }
  }, [open, defaultLeadId]);

  // Meetings are fetched per lead from the same endpoint the Meetings page uses,
  // so this list cannot drift from what the user sees there.
  const { data: meetingData, isLoading: loadingMeetings } = useQuery({
    queryKey: ["sales-meetings", "for-lead", leadId],
    queryFn: () => apiGet<{ meetings: MeetingOption[] }>(`/api/sales/meetings?lead=${leadId}`),
    enabled: open && Boolean(leadId),
  });

  const meetings = meetingData?.meetings ?? [];

  // Changing the lead invalidates any meeting already chosen — a meeting only
  // ever belongs to one lead, and the API rejects a mismatch.
  function onLeadChange(next: string) {
    setLeadId(next);
    setMeetingId("");
  }

  const save = useMutation({
    mutationFn: ({ submit }: { submit: boolean }) =>
      apiSend(`/api/sales/leads/${leadId}/brief?new=1`, "PUT", {
        meetingId: meetingId || null,
        additionalNotes: notes,
        status: submit ? "SUBMITTED" : "DRAFT",
      }),
    onSuccess: (_r, v) => {
      toast.success(v.submit ? "Discovery brief submitted" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["sales-briefs"] });
      qc.invalidateQueries({ queryKey: ["sales-lead", leadId] });
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(asSubmitted: boolean) {
    if (!leadId) {
      setError("Choose which lead this brief is for.");
      return;
    }
    if (!notes.trim()) {
      setError("Write the brief before saving it.");
      return;
    }
    setError(null);
    save.mutate({ submit: asSubmitted });
  }

  const leads = meta?.leads ?? [];
  const busy = save.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New discovery brief"
      description="Pick the lead and the meeting it came from, then write the brief."
    >
      <div className="space-y-4">
        <Field label="Lead" required>
          <Select value={leadId} onChange={(e) => onLeadChange(e.target.value)} disabled={busy}>
            <option value="">Select a lead…</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.companyName}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Meeting"
          hint={
            !leadId
              ? "Choose a lead first to see its meetings."
              : loadingMeetings
                ? "Loading meetings…"
                : meetings.length === 0
                  ? "This lead has no meetings yet — you can still save the brief without one."
                  : "Optional. Link the meeting this brief came out of."
          }
        >
          <Select
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            disabled={busy || !leadId || loadingMeetings || meetings.length === 0}
          >
            <option value="">No specific meeting</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {formatDateTime(m.scheduledAt)} · {m.title} ({MEETING_TYPE_META[m.type].label})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Brief" required>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            disabled={busy}
            placeholder="What did you learn? Goals, budget, audience, next steps…"
          />
        </Field>

        <p className="text-[11px] text-muted-foreground">
          This saves the brief against the lead. Open the lead&apos;s Discovery tab
          to fill in the full form — audience, competitors, assets and the rest.
        </p>

        {error && <p className="text-xs font-medium text-destructive">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => submit(false)} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save draft
          </Button>
          <Button onClick={() => submit(true)} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit brief
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
