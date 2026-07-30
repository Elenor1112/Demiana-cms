"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus, Loader2, Send, CheckCircle2, XCircle, MailOpen, Download, ExternalLink,
  MessageCircle, ClipboardList, ArrowRight, Trash2,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useCan } from "@/components/session-context";
import { useSession } from "@/components/session-context";
import {
  SectionCard, EmptyState, Icon, StageBadge, TemperatureBadge,
  formatDate, formatDateTime, formatRelative, type PersonRef,
} from "@/components/sales/sales-bits";
import { AttachmentsPanel, type SalesAttachment } from "@/components/sales/attachments-panel";
import { MeetingDialog } from "@/components/sales/meeting-dialog";
import { DiscoveryForm } from "@/components/sales/discovery-form";
import { FeedbackDialog } from "@/components/sales/feedback-dialog";
import { ProposalDialog } from "@/components/sales/proposal-dialog";
import {
  SALES_ACTIVITY_META, DEFAULT_ACTIVITY_META, LEAD_STAGE_META,
  MEETING_STATUS_META, MEETING_TYPE_META, BRIEF_STATUS_META,
  PROPOSAL_STATUS_META, PROPOSAL_EVENT_META, DECISION_TIMELINE_META,
  formatMoney,
} from "@/lib/sales-constants";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";
import type {
  BriefStatus, LeadPriority, LeadSource, LeadStage, MeetingStatus, MeetingType,
  OpportunityTemperature, ProposalEventType, ProposalStatus, TaskPriority, TaskStatus,
  DecisionTimeline, MeetingLocationType,
} from "@prisma/client";

// ─── Types mirroring /api/sales/leads/[id] ───────────────────

export type LeadMeeting = {
  id: string; title: string; type: MeetingType; locationType: MeetingLocationType;
  location: string | null; meetingLink: string | null; scheduledAt: string;
  durationMinutes: number; agenda: string | null; preparationNotes: string | null;
  status: MeetingStatus; outcome: string | null; completedAt: string | null;
  organizer: PersonRef;
  attendees: { user: PersonRef }[];
  requirements: { id: string; key: string; label: string; done: boolean; order: number }[];
  _count: { feedback: number; attachments: number };
};

export type LeadBrief = {
  id: string; status: BriefStatus; submittedAt: string | null;
  submittedBy: PersonRef | null; createdAt: string; updatedAt: string;
  attachments: SalesAttachment[];
  [key: string]: unknown;
};

export type LeadFeedback = {
  id: string; opportunityScore: number; temperature: OpportunityTemperature;
  closingProbability: number | null; decisionTimeline: DecisionTimeline;
  decisionMakerPresent: boolean; finalDecisionMaker: string | null;
  clientPersonality: string | null; objections: string | null;
  buyingSignals: string | null; operationalRisks: string | null;
  proposalRecommendations: string | null; servicesRecommended: string[];
  nextAction: string | null; nextMeetingDate: string | null; internalNotes: string | null;
  meetingDate: string | null; meetingType: MeetingType | null; stage: LeadStage | null;
  opportunityStrength: number | null; createdAt: string;
  author: PersonRef;
  meeting: { id: string; title: string; scheduledAt: string } | null;
  attachments: SalesAttachment[];
};

export type LeadProposal = {
  id: string; version: number; title: string; summary: string | null;
  amount: number | null; currency: string; status: ProposalStatus;
  preparedAt: string; sentAt: string | null; openedAt: string | null;
  downloadedAt: string | null; viewedAt: string | null; acceptedAt: string | null;
  rejectedAt: string | null; contractSignedAt: string | null; validUntil: string | null;
  revisionCount: number; viewCount: number; rejectionReason: string | null;
  preparedBy: PersonRef;
  events: {
    id: string; type: ProposalEventType; note: string | null;
    createdAt: string; actor: PersonRef | null;
  }[];
  attachments: SalesAttachment[];
};

export type LeadDetail = {
  id: string; code: string; companyName: string; brandName: string | null;
  contactPerson: string | null; jobTitle: string | null; email: string | null;
  phone: string | null; website: string | null; industry: string | null;
  companySize: string | null; country: string | null; city: string | null;
  socialLinks: { platform: string; url: string }[] | null;
  stage: LeadStage; priority: LeadPriority; source: LeadSource;
  estimatedValue: number | null; probability: number;
  expectedCloseDate: string | null; nextFollowUpAt: string | null;
  lastActivityAt: string | null; tags: string[]; notes: string | null;
  lostReason: string | null; wonAt: string | null; lostAt: string | null;
  convertedClientId: string | null; convertedAt: string | null;
  createdAt: string; updatedAt: string;
  owner: PersonRef | null;
  createdBy: PersonRef;
  convertedClient: { id: string; company: string; status: string } | null;
  meetings: LeadMeeting[];
  briefs: LeadBrief[];
  feedback: LeadFeedback[];
  proposals: LeadProposal[];
  comments: { id: string; body: string; createdAt: string; author: PersonRef }[];
  attachments: SalesAttachment[];
  activities: {
    id: string; verb: string; summary: string | null; createdAt: string;
    actor: PersonRef | null; meta: unknown;
  }[];
  stageChanges: {
    id: string; fromStage: LeadStage | null; toStage: LeadStage;
    actorId: string | null; changedAt: string;
  }[];
  ownerHistory: {
    id: string; assignedAt: string; unassignedAt: string | null;
    owner: PersonRef | null; assignedBy: PersonRef;
  }[];
  tasks: {
    id: string; code: string; title: string; status: TaskStatus;
    priority: TaskPriority; deadline: string | null;
  }[];
  ideas: {
    id: string; title: string; status: string;
    convertedTaskId: string | null; convertedProjectId: string | null;
  }[];
};

const LEAD_KEY = (id: string) => ["sales-lead", id];

// ─── Overview ────────────────────────────────────────────────

export function OverviewTab({ lead }: { lead: LeadDetail }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Company">
        <dl className="space-y-2.5 text-sm">
          <Row label="Company">{lead.companyName}</Row>
          <Row label="Brand">{lead.brandName ?? "—"}</Row>
          <Row label="Industry">{lead.industry ?? "—"}</Row>
          <Row label="Company size">{lead.companySize ?? "—"}</Row>
          <Row label="Website">
            {lead.website ? (
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {lead.website}
              </a>
            ) : "—"}
          </Row>
          <Row label="Location">
            {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
          </Row>
        </dl>
      </SectionCard>

      <SectionCard title="Contact">
        <dl className="space-y-2.5 text-sm">
          <Row label="Contact person">{lead.contactPerson ?? "—"}</Row>
          <Row label="Job title">{lead.jobTitle ?? "—"}</Row>
          <Row label="Email">{lead.email ?? "—"}</Row>
          <Row label="Phone">{lead.phone ?? "—"}</Row>
          <Row label="Social">
            {lead.socialLinks?.length ? (
              <span className="flex flex-wrap gap-1.5">
                {lead.socialLinks.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary hover:underline"
                  >
                    {s.platform}
                  </a>
                ))}
              </span>
            ) : "—"}
          </Row>
        </dl>
      </SectionCard>

      <SectionCard title="Deal">
        <dl className="space-y-2.5 text-sm">
          <Row label="Value">{formatMoney(lead.estimatedValue)}</Row>
          <Row label="Probability">{lead.probability}%</Row>
          <Row label="Expected close">{formatDate(lead.expectedCloseDate)}</Row>
          <Row label="Source">{lead.source.replace(/_/g, " ").toLowerCase()}</Row>
          <Row label="Priority">{lead.priority.toLowerCase()}</Row>
          {lead.wonAt && <Row label="Won">{formatDate(lead.wonAt)}</Row>}
          {lead.lostAt && <Row label="Lost">{formatDate(lead.lostAt)}</Row>}
          {lead.lostReason && <Row label="Loss reason">{lead.lostReason}</Row>}
        </dl>
      </SectionCard>

      <SectionCard title="Ownership & notes">
        <dl className="space-y-2.5 text-sm">
          <Row label="Owner">
            {lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : "Unassigned"}
          </Row>
          <Row label="Created by">
            {lead.createdBy.firstName} {lead.createdBy.lastName} · {formatDate(lead.createdAt)}
          </Row>
          <Row label="Next follow-up">{formatDate(lead.nextFollowUpAt)}</Row>
          <Row label="Tags">
            {lead.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {lead.tags.map((t) => <Badge key={t}>{t}</Badge>)}
              </span>
            ) : "—"}
          </Row>
        </dl>
        {lead.notes && (
          <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
            {lead.notes}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

// ─── Timeline (stage + owner history) ────────────────────────

export function TimelineTab({ lead }: { lead: LeadDetail }) {
  // Stage moves and ownership changes are one story, so they are merged and
  // sorted rather than shown as two disconnected lists.
  const events = [
    ...lead.stageChanges.map((s) => ({
      id: `stage-${s.id}`,
      at: s.changedAt,
      icon: "ArrowRightLeft",
      color: LEAD_STAGE_META[s.toStage].color,
      title: s.fromStage
        ? `${LEAD_STAGE_META[s.fromStage].label} → ${LEAD_STAGE_META[s.toStage].label}`
        : `Created as ${LEAD_STAGE_META[s.toStage].label}`,
      subtitle: null as string | null,
    })),
    ...lead.ownerHistory.map((o) => ({
      id: `owner-${o.id}`,
      at: o.assignedAt,
      icon: "UserPlus",
      color: "#8B5CF6",
      title: o.owner
        ? `Assigned to ${o.owner.firstName} ${o.owner.lastName}`
        : "Ownership cleared",
      subtitle: `by ${o.assignedBy.firstName} ${o.assignedBy.lastName}`,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (!events.length) {
    return <EmptyState icon="History" title="No history yet" />;
  }

  return (
    <Card className="p-5">
      <ol className="relative space-y-4 border-l border-border pl-6">
        {events.map((e) => (
          <li key={e.id} className="relative">
            <span
              className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full ring-4 ring-card"
              style={{ backgroundColor: `${e.color}1A`, color: e.color }}
            >
              <Icon name={e.icon} className="size-3" />
            </span>
            <div className="text-sm font-medium">{e.title}</div>
            <div className="text-xs text-muted-foreground">
              {e.subtitle ? `${e.subtitle} · ` : ""}
              {formatDateTime(e.at)} · {formatRelative(e.at)}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─── Activities ──────────────────────────────────────────────

export function ActivitiesTab({ lead }: { lead: LeadDetail }) {
  if (!lead.activities.length) {
    return <EmptyState icon="Activity" title="No activity recorded" />;
  }
  return (
    <Card className="p-5">
      <ol className="relative space-y-4 border-l border-border pl-6">
        {lead.activities.map((a) => {
          const meta = SALES_ACTIVITY_META[a.verb] ?? DEFAULT_ACTIVITY_META;
          return (
            <li key={a.id} className="relative">
              <span
                className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full ring-4 ring-card"
                style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
              >
                <Icon name={meta.icon} className="size-3" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{meta.label}</span>
                {a.actor && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Avatar
                      firstName={a.actor.firstName}
                      lastName={a.actor.lastName}
                      src={a.actor.avatarUrl}
                      size={16}
                    />
                    {a.actor.firstName} {a.actor.lastName}
                  </span>
                )}
              </div>
              {a.summary && <div className="text-sm text-muted-foreground">{a.summary}</div>}
              <div className="text-xs text-muted-foreground">
                {formatDateTime(a.createdAt)} · {formatRelative(a.createdAt)}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ─── Meetings ────────────────────────────────────────────────

export function MeetingsTab({ lead, readOnly }: { lead: LeadDetail; readOnly?: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LeadMeeting | null>(null);
  const [deleting, setDeleting] = React.useState<LeadMeeting | null>(null);

  const remove = useMutation({
    mutationFn: (meetingId: string) => apiSend(`/api/sales/meetings/${meetingId}`, "DELETE"),
    onSuccess: () => {
      toast.success("Meeting deleted");
      qc.invalidateQueries({ queryKey: LEAD_KEY(lead.id) });
      qc.invalidateQueries({ queryKey: ["sales-meetings"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRequirement = useMutation({
    mutationFn: ({ meetingId, key, done }: { meetingId: string; key: string; done: boolean }) =>
      apiSend(`/api/sales/meetings/${meetingId}`, "PUT", { key, done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEAD_KEY(lead.id) }),
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: (meetingId: string) =>
      apiSend(`/api/sales/meetings/${meetingId}`, "PATCH", { status: "COMPLETED" }),
    onSuccess: () => {
      toast.success("Meeting completed");
      qc.invalidateQueries({ queryKey: LEAD_KEY(lead.id) });
    },
    // The API refuses without feedback; surfacing its message verbatim tells
    // the user exactly what to do next.
    onError: (e: Error) => toast.error(e.message),
  });

  const editable = can("Sales.MeetingManage") && !readOnly;

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4" /> Schedule meeting
          </Button>
        </div>
      )}

      {lead.meetings.length === 0 ? (
        <EmptyState
          icon="CalendarClock"
          title="No meetings yet"
          description="Schedule the first conversation with this company."
          action={editable ? (
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Schedule meeting</Button>
          ) : undefined}
        />
      ) : (
        lead.meetings.map((m) => {
          const doneCount = m.requirements.filter((r) => r.done).length;
          return (
            <Card key={m.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold">{m.title}</h4>
                    <Badge color={MEETING_STATUS_META[m.status].color}>
                      {MEETING_STATUS_META[m.status].label}
                    </Badge>
                    <Badge>{MEETING_TYPE_META[m.type].label}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatDateTime(m.scheduledAt)} · {m.durationMinutes} min
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                  {m.meetingLink && (
                    <a
                      href={m.meetingLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" /> Join meeting
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {editable && (
                    <Button variant="outline" size="sm" onClick={() => { setEditing(m); setOpen(true); }}>
                      Edit
                    </Button>
                  )}
                  {editable && m.status === "SCHEDULED" && (
                    <Button
                      size="sm"
                      onClick={() => complete.mutate(m.id)}
                      disabled={complete.isPending}
                    >
                      {complete.isPending && <Loader2 className="size-4 animate-spin" />}
                      Mark completed
                    </Button>
                  )}
                  {editable && (
                    <button
                      onClick={() => setDeleting(m)}
                      aria-label={`Delete ${m.title}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>

              {m.agenda && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{m.agenda}</p>
              )}

              {/* readiness checklist */}
              <div className="mt-4 rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Preparation checklist
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {doneCount}/{m.requirements.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {m.requirements.map((r) => (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-center gap-2 text-sm ${
                        editable ? "" : "cursor-default"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={r.done}
                        disabled={!editable || toggleRequirement.isPending}
                        onChange={(e) =>
                          toggleRequirement.mutate({
                            meetingId: m.id, key: r.key, done: e.target.checked,
                          })
                        }
                        className="size-4 rounded border-input accent-primary"
                      />
                      <span className={r.done ? "text-muted-foreground line-through" : ""}>
                        {r.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {m.status === "SCHEDULED" && m._count.feedback === 0 && (
                <p className="mt-2 text-xs text-warning">
                  Feedback must be submitted before this meeting can be marked completed.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">Attendees</span>
                {m.attendees.map((a) => (
                  <span key={a.user.id} className="flex items-center gap-1 text-xs">
                    <Avatar
                      firstName={a.user.firstName}
                      lastName={a.user.lastName}
                      src={a.user.avatarUrl}
                      size={18}
                    />
                    {a.user.firstName}
                  </span>
                ))}
              </div>
            </Card>
          );
        })
      )}

      <MeetingDialog
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        leadId={lead.id}
        meeting={editing}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete ${deleting?.title ?? "meeting"}?`}
        description="This removes the meeting and its preparation checklist. Any submitted feedback stays on the lead."
        pending={remove.isPending}
      />
    </div>
  );
}

// ─── Discovery ───────────────────────────────────────────────

export function DiscoveryTab({ lead, readOnly }: { lead: LeadDetail; readOnly?: boolean }) {
  const can = useCan();
  const editable = can("Sales.DiscoverySubmit") && !readOnly;
  const brief = lead.briefs[0] ?? null;

  return (
    <DiscoveryForm
      leadId={lead.id}
      brief={brief}
      allBriefs={lead.briefs}
      readOnly={!editable}
    />
  );
}

// ─── Feedback ────────────────────────────────────────────────

export function FeedbackTab({ lead, readOnly }: { lead: LeadDetail; readOnly?: boolean }) {
  const can = useCan();
  const [open, setOpen] = React.useState(false);
  const editable = can("Sales.FeedbackSubmit") && !readOnly;

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New feedback</Button>
        </div>
      )}

      {lead.feedback.length === 0 ? (
        <EmptyState
          icon="MessageSquareText"
          title="No feedback yet"
          description="Debrief a meeting to score this opportunity."
          action={editable ? (
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New feedback</Button>
          ) : undefined}
        />
      ) : (
        lead.feedback.map((f) => (
          <Card key={f.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <TemperatureBadge temperature={f.temperature} score={f.opportunityScore} />
                  {f.stage && <StageBadge stage={f.stage} />}
                  {f.decisionMakerPresent && <Badge color="#22C55E">Decision maker present</Badge>}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {f.author.firstName} {f.author.lastName} · {formatDateTime(f.createdAt)}
                  {f.meeting ? ` · ${f.meeting.title}` : ""}
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums">{f.opportunityScore}</div>
                <div className="text-[11px] text-muted-foreground">opportunity score</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <dl className="space-y-2 text-sm">
                <Row label="Closing prob.">
                  {f.closingProbability !== null ? `${f.closingProbability}%` : "—"}
                </Row>
                <Row label="Timeline">{DECISION_TIMELINE_META[f.decisionTimeline].label}</Row>
                <Row label="Decision maker">{f.finalDecisionMaker ?? "—"}</Row>
                <Row label="Personality">{f.clientPersonality ?? "—"}</Row>
                <Row label="Next action">{f.nextAction ?? "—"}</Row>
                <Row label="Next meeting">{formatDate(f.nextMeetingDate)}</Row>
              </dl>
              <dl className="space-y-2 text-sm">
                <Row label="Objections">{f.objections ?? "—"}</Row>
                <Row label="Buying signals">{f.buyingSignals ?? "—"}</Row>
                <Row label="Risks">{f.operationalRisks ?? "—"}</Row>
                <Row label="Recommendations">{f.proposalRecommendations ?? "—"}</Row>
                <Row label="Services">
                  {f.servicesRecommended.length ? (
                    <span className="flex flex-wrap gap-1">
                      {f.servicesRecommended.map((s) => <Badge key={s}>{s}</Badge>)}
                    </span>
                  ) : "—"}
                </Row>
              </dl>
            </div>

            {f.internalNotes && (
              <p className="mt-3 whitespace-pre-wrap border-t border-border pt-3 text-sm text-muted-foreground">
                {f.internalNotes}
              </p>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <AttachmentsPanel
                parent={{ feedbackId: f.id }}
                attachments={f.attachments}
                invalidateKeys={[LEAD_KEY(lead.id)]}
                readOnly={!editable}
              />
            </div>
          </Card>
        ))
      )}

      <FeedbackDialog
        open={open}
        onClose={() => setOpen(false)}
        leadId={lead.id}
        meetings={lead.meetings}
        stage={lead.stage}
      />
    </div>
  );
}

// ─── Proposals ───────────────────────────────────────────────

export function ProposalTab({ lead, readOnly }: { lead: LeadDetail; readOnly?: boolean }) {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [revisionOf, setRevisionOf] = React.useState<LeadProposal | null>(null);
  const editable = can("Sales.ProposalManage") && !readOnly;

  const recordEvent = useMutation({
    mutationFn: ({ id, type }: { id: string; type: ProposalEventType }) =>
      apiSend(`/api/sales/proposals/${id}`, "POST", { type }),
    onSuccess: (_r, v) => {
      toast.success(`Marked ${PROPOSAL_EVENT_META[v.type].label.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: LEAD_KEY(lead.id) });
      qc.invalidateQueries({ queryKey: ["sales-proposals"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => { setRevisionOf(null); setOpen(true); }}>
            <Plus className="size-4" /> New proposal
          </Button>
        </div>
      )}

      {lead.proposals.length === 0 ? (
        <EmptyState
          icon="FileBadge"
          title="No proposals yet"
          description="Draft a proposal once discovery is complete."
          action={editable ? (
            <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New proposal</Button>
          ) : undefined}
        />
      ) : (
        lead.proposals.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{p.title}</h4>
                  <Badge>v{p.version}</Badge>
                  <Badge color={PROPOSAL_STATUS_META[p.status].color}>
                    {PROPOSAL_STATUS_META[p.status].label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {p.preparedBy.firstName} {p.preparedBy.lastName} · {formatDate(p.preparedAt)}
                  {p.validUntil ? ` · valid until ${formatDate(p.validUntil)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">{formatMoney(p.amount, p.currency)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {p.viewCount} view{p.viewCount === 1 ? "" : "s"}
                  {p.revisionCount > 0 ? ` · ${p.revisionCount} revision${p.revisionCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            </div>

            {p.summary && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{p.summary}</p>
            )}

            {/* quick event buttons — the tracking the brief asks for */}
            {editable && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.status === "DRAFT" && (
                  <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "SENT" })}>
                    <Send className="size-3.5" /> Mark sent
                  </Button>
                )}
                {p.sentAt && !p.openedAt && (
                  <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "OPENED" })}>
                    <MailOpen className="size-3.5" /> Mark opened
                  </Button>
                )}
                {p.sentAt && (
                  <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "DOWNLOADED" })}>
                    <Download className="size-3.5" /> Mark downloaded
                  </Button>
                )}
                {!["ACCEPTED", "REJECTED"].includes(p.status) && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "ACCEPTED" })}>
                      <CheckCircle2 className="size-3.5" /> Accepted
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "REJECTED" })}>
                      <XCircle className="size-3.5" /> Rejected
                    </Button>
                  </>
                )}
                {p.status === "ACCEPTED" && !p.contractSignedAt && (
                  <Button size="sm" variant="outline" onClick={() => recordEvent.mutate({ id: p.id, type: "CONTRACT_SIGNED" })}>
                    <CheckCircle2 className="size-3.5" /> Contract signed
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setRevisionOf(p); setOpen(true); }}>
                  <Plus className="size-3.5" /> New revision
                </Button>
              </div>
            )}

            {/* event timeline */}
            {p.events.length > 0 && (
              <ol className="mt-4 space-y-2 border-t border-border pt-3">
                {p.events.map((e) => {
                  const meta = PROPOSAL_EVENT_META[e.type];
                  return (
                    <li key={e.id} className="flex items-center gap-2 text-xs">
                      <Icon name={meta.icon} className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{meta.label}</span>
                      {e.actor && (
                        <span className="text-muted-foreground">
                          by {e.actor.firstName} {e.actor.lastName}
                        </span>
                      )}
                      {e.note && <span className="text-muted-foreground">· {e.note}</span>}
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-4 border-t border-border pt-3">
              <AttachmentsPanel
                parent={{ proposalId: p.id }}
                attachments={p.attachments}
                invalidateKeys={[LEAD_KEY(lead.id)]}
                readOnly={!editable}
              />
            </div>
          </Card>
        ))
      )}

      <ProposalDialog
        open={open}
        onClose={() => { setOpen(false); setRevisionOf(null); }}
        leadId={lead.id}
        revisionOf={revisionOf}
      />
    </div>
  );
}

// ─── Tasks ───────────────────────────────────────────────────

export function TasksTab({ lead }: { lead: LeadDetail }) {
  if (!lead.tasks.length) {
    return (
      <EmptyState
        icon="CheckCheck"
        title="No tasks yet"
        description="Tasks created from this lead's ideas appear here."
      />
    );
  }
  return (
    <div className="space-y-2">
      {lead.tasks.map((t) => (
        <Link
          key={t.id}
          href={`/tasks?task=${t.id}`}
          className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/50"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{t.title}</div>
            <div className="text-xs text-muted-foreground">
              {t.code} · due {formatDate(t.deadline)}
            </div>
          </div>
          <Badge color={TASK_STATUS_META[t.status].color}>{TASK_STATUS_META[t.status].label}</Badge>
          <Badge color={PRIORITY_META[t.priority].color}>{PRIORITY_META[t.priority].label}</Badge>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}

// ─── Files ───────────────────────────────────────────────────

export function FilesTab({ lead, readOnly }: { lead: LeadDetail; readOnly?: boolean }) {
  const can = useCan();
  return (
    <Card className="p-5">
      <AttachmentsPanel
        parent={{ leadId: lead.id }}
        attachments={lead.attachments}
        invalidateKeys={[LEAD_KEY(lead.id)]}
        readOnly={!can("Sales.LeadEdit") || readOnly}
      />
    </Card>
  );
}

// ─── Comments ────────────────────────────────────────────────

export function CommentsTab({ lead }: { lead: LeadDetail }) {
  const qc = useQueryClient();
  const session = useSession();
  const [body, setBody] = React.useState("");

  const post = useMutation({
    mutationFn: (text: string) =>
      apiSend(`/api/sales/leads/${lead.id}/comments`, "POST", { body: text, mentions: [] }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: LEAD_KEY(lead.id) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex gap-3">
          <Avatar
            firstName={session.firstName}
            lastName={session.lastName}
            src={session.avatarUrl}
            size={32}
          />
          <div className="flex-1 space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!body.trim() || post.isPending}
                onClick={() => post.mutate(body.trim())}
              >
                {post.isPending && <Loader2 className="size-4 animate-spin" />}
                <MessageCircle className="size-4" /> Comment
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {lead.comments.length === 0 ? (
        <EmptyState icon="MessageCircle" title="No comments yet" />
      ) : (
        <div className="space-y-3">
          {lead.comments.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex gap-3">
                <Avatar
                  firstName={c.author.firstName}
                  lastName={c.author.lastName}
                  src={c.author.avatarUrl}
                  size={32}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">
                      {c.author.firstName} {c.author.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(c.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Audit log ───────────────────────────────────────────────

type AuditRow = {
  id: string; action: string; entity: string; entityId: string | null;
  createdAt: string; oldValue: unknown; newValue: unknown;
  actor: { firstName: string; lastName: string } | null;
};

export function AuditTab({ lead }: { lead: LeadDetail }) {
  const can = useCan();

  const { data, isLoading } = useQuery({
    queryKey: ["sales-lead-audit", lead.id],
    queryFn: () => apiGet<{ logs: AuditRow[] }>(`/api/audit?entityId=${lead.id}`),
    enabled: can("Audit.View"),
  });

  if (!can("Audit.View")) {
    return (
      <EmptyState
        icon="Lock"
        title="Audit log restricted"
        description="You do not have permission to view audit records."
      />
    );
  }
  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  const logs = data?.logs ?? [];
  if (!logs.length) return <EmptyState icon="ScrollText" title="No audit records" />;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[600px] text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left">
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-semibold">Action</th>
            <th className="px-4 py-2.5 font-semibold">Actor</th>
            <th className="px-4 py-2.5 font-semibold">When</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5 font-medium">{l.action}</td>
              <td className="px-4 py-2.5">
                {l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : "System"}
              </td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {formatDateTime(l.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { ClipboardList };
