"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, ArrowRight, Paperclip, Plus, CalendarDays } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/session-context";
import {
  EmptyState, CardGridSkeleton, StageBadge, formatRelative, formatDateTime, type PersonRef,
} from "@/components/sales/sales-bits";
import { BriefDialog } from "@/components/sales/brief-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import { BRIEF_STATUS_META } from "@/lib/sales-constants";
import type { BriefStatus, LeadStage, MeetingStatus } from "@prisma/client";

type BriefRow = {
  id: string; status: BriefStatus; submittedAt: string | null;
  createdAt: string; updatedAt: string;
  companyName: string | null; industry: string | null;
  marketingGoals: string[]; servicesRequested: string[]; successMetrics: string[];
  submittedBy: PersonRef | null;
  lead: { id: string; code: string; companyName: string; stage: LeadStage };
  meeting: { id: string; title: string; scheduledAt: string; status: MeetingStatus } | null;
  _count: { attachments: number };
};

export function DiscoveryClient() {
  const params = useSearchParams();
  const can = useCan();
  const { data: meta } = useSalesMeta();
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState(params.get("status") ?? "");
  const [createOpen, setCreateOpen] = React.useState(false);

  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qp = new URLSearchParams();
  if (debouncedQ) qp.set("q", debouncedQ);
  if (status) qp.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-briefs", debouncedQ, status],
    queryFn: () => apiGet<{ briefs: BriefRow[] }>(`/api/sales/briefs?${qp.toString()}`),
  });

  const briefs = data?.briefs ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by company…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
          <option value="">Any status</option>
          {Object.entries(BRIEF_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        {can("Sales.DiscoverySubmit") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New brief
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Start a brief here against any lead and meeting, or open a lead and use
        its Discovery tab for the full form.
      </p>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-52" /></div>
      ) : briefs.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="ClipboardList"
            title="No discovery briefs yet"
            description="Use “New brief” to pick a lead and a meeting and write the first one."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {briefs.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Link href={`/sales/leads/${b.lead.id}?tab=discovery`} className="block h-full">
                <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {b.companyName || b.lead.companyName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {b.lead.code}
                        {b.industry ? ` · ${b.industry}` : ""}
                      </p>
                    </div>
                    <Badge color={BRIEF_STATUS_META[b.status].color}>
                      {BRIEF_STATUS_META[b.status].label}
                    </Badge>
                  </div>

                  {b.meeting && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <CalendarDays className="size-3 shrink-0" />
                      <span className="truncate">
                        {b.meeting.title} · {formatDateTime(b.meeting.scheduledAt)}
                      </span>
                    </div>
                  )}

                  {b.servicesRequested.length > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                        Services requested
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {b.servicesRequested.slice(0, 4).map((s) => (
                          <Badge key={s} className="text-[10px]">{s}</Badge>
                        ))}
                        {b.servicesRequested.length > 4 && (
                          <Badge className="text-[10px]">+{b.servicesRequested.length - 4}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  {b.marketingGoals.length > 0 && (
                    <div className="mt-2.5">
                      <div className="mb-1 text-[11px] font-medium text-muted-foreground">Goals</div>
                      <div className="flex flex-wrap gap-1">
                        {b.marketingGoals.slice(0, 3).map((g) => (
                          <Badge key={g} className="text-[10px]">{g}</Badge>
                        ))}
                        {b.marketingGoals.length > 3 && (
                          <Badge className="text-[10px]">+{b.marketingGoals.length - 3}</Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <StageBadge stage={b.lead.stage} />
                    {b._count.attachments > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="size-3" /> {b._count.attachments}
                      </span>
                    )}
                    <span className="ml-auto">
                      {b.submittedAt ? `Submitted ${formatRelative(b.submittedAt)}` : `Updated ${formatRelative(b.updatedAt)}`}
                    </span>
                    <ArrowRight className="size-3.5" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <BriefDialog open={createOpen} onClose={() => setCreateOpen(false)} meta={meta} />
    </div>
  );
}
