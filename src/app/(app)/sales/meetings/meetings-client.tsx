"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, Search, ExternalLink, MapPin, Clock } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useCan } from "@/components/session-context";
import {
  EmptyState, CardGridSkeleton, formatDateTime, formatRelative, type PersonRef,
} from "@/components/sales/sales-bits";
import { MeetingDialog } from "@/components/sales/meeting-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import {
  MEETING_STATUS_META, MEETING_TYPE_META, MEETING_LOCATION_META,
} from "@/lib/sales-constants";
import type { MeetingLocationType, MeetingStatus, MeetingType } from "@prisma/client";

type MeetingRow = {
  id: string; title: string; type: MeetingType; locationType: MeetingLocationType;
  location: string | null; meetingLink: string | null; scheduledAt: string;
  durationMinutes: number; agenda: string | null; preparationNotes: string | null;
  status: MeetingStatus; outcome: string | null;
  lead: { id: string; code: string; companyName: string };
  organizer: PersonRef;
  attendees: { user: PersonRef }[];
  requirements: { id: string; key: string; label: string; done: boolean }[];
  _count: { feedback: number; attachments: number };
};

export function MeetingsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [q, setQ] = React.useState("");
  const [range, setRange] = React.useState(params.get("range") ?? "upcoming");
  const [status, setStatus] = React.useState("");
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const [editing, setEditing] = React.useState<MeetingRow | null>(null);

  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qp = new URLSearchParams();
  if (debouncedQ) qp.set("q", debouncedQ);
  if (range) qp.set("range", range);
  if (status) qp.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-meetings", debouncedQ, range, status],
    queryFn: () => apiGet<{ meetings: MeetingRow[] }>(`/api/sales/meetings?${qp.toString()}`),
  });

  // A ?meeting=<id> deep link (from search or a notification) opens that
  // meeting's editor once the list has loaded.
  const focusId = params.get("meeting");
  React.useEffect(() => {
    if (!focusId || !data) return;
    const found = data.meetings.find((m) => m.id === focusId);
    if (found) {
      setEditing(found);
      setOpen(true);
    }
  }, [focusId, data]);

  const meetings = data?.meetings ?? [];
  const editable = can("Sales.MeetingManage");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search meetings…"
            className="pl-9"
          />
        </div>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
          <option value="">All time</option>
          <option value="today">Today</option>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">Any status</option>
          {Object.entries(MEETING_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        {editable && (
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="size-4" /> Schedule
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-48" /></div>
      ) : meetings.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="CalendarClock"
            title="No meetings found"
            description={range === "upcoming" ? "Nothing scheduled ahead." : "Try a different filter."}
            action={editable ? (
              <Button onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="size-4" /> Schedule meeting
              </Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {meetings.map((m, i) => {
            const done = m.requirements.filter((r) => r.done).length;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 truncate font-semibold">{m.title}</h3>
                    <Badge color={MEETING_STATUS_META[m.status].color}>
                      {MEETING_STATUS_META[m.status].label}
                    </Badge>
                  </div>

                  <Link
                    href={`/sales/leads/${m.lead.id}`}
                    className="mt-0.5 truncate text-sm text-primary hover:underline"
                  >
                    {m.lead.companyName}
                  </Link>

                  <div className="mt-2.5 space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" />
                      {formatDateTime(m.scheduledAt)} · {m.durationMinutes}m
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3 shrink-0" />
                      {m.location || MEETING_LOCATION_META[m.locationType].label}
                    </div>
                    <div>{MEETING_TYPE_META[m.type].label}</div>
                  </div>

                  {m.meetingLink && (
                    <a
                      href={m.meetingLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3" /> Join
                    </a>
                  )}

                  {/* Readiness at a glance — the checklist itself lives on the
                      lead's Meetings tab, where there is room for it. */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Preparation</span>
                      <span className="tabular-nums">{done}/{m.requirements.length}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{
                          width: `${m.requirements.length ? (done / m.requirements.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
                    <div className="flex -space-x-1.5">
                      {m.attendees.slice(0, 4).map((a) => (
                        <Avatar
                          key={a.user.id}
                          firstName={a.user.firstName}
                          lastName={a.user.lastName}
                          src={a.user.avatarUrl}
                          size={22}
                        />
                      ))}
                    </div>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {formatRelative(m.scheduledAt)}
                    </span>
                    {editable && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditing(m); setOpen(true); }}
                      >
                        Edit
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <MeetingDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          // Clear deep-link params so a refresh does not reopen the dialog.
          if (params.get("new") || params.get("meeting")) router.replace("/sales/meetings");
        }}
        meeting={editing}
        leadPickerLeads={meta?.leads}
      />
    </div>
  );
}
