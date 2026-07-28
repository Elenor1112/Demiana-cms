"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, ArrowRight } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useCan } from "@/components/session-context";
import {
  EmptyState, CardGridSkeleton, StageBadge, TemperatureBadge, StatTile,
  formatDate, formatRelative, type PersonRef,
} from "@/components/sales/sales-bits";
import { FeedbackDialog } from "@/components/sales/feedback-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import { TEMPERATURE_META, DECISION_TIMELINE_META } from "@/lib/sales-constants";
import type {
  DecisionTimeline, LeadStage, OpportunityTemperature,
} from "@prisma/client";

type FeedbackRow = {
  id: string; opportunityScore: number; temperature: OpportunityTemperature;
  closingProbability: number | null; decisionTimeline: DecisionTimeline;
  decisionMakerPresent: boolean; objections: string | null;
  buyingSignals: string | null; nextAction: string | null;
  nextMeetingDate: string | null; servicesRecommended: string[];
  stage: LeadStage | null; createdAt: string;
  lead: { id: string; code: string; companyName: string; stage: LeadStage };
  author: PersonRef;
  meeting: { id: string; title: string; scheduledAt: string } | null;
  attachments: { id: string; name: string; isVoiceNote: boolean }[];
};

export function FeedbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [temperature, setTemperature] = React.useState("");
  const [open, setOpen] = React.useState(params.get("new") === "1");

  const qp = new URLSearchParams();
  if (temperature) qp.set("temperature", temperature);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-feedback", temperature],
    queryFn: () => apiGet<{ feedback: FeedbackRow[] }>(`/api/sales/feedback?${qp.toString()}`),
  });

  const rows = data?.feedback ?? [];

  // Temperature spread across everything visible — the quickest read of how
  // healthy the qualified pipeline actually is.
  const spread = React.useMemo(() => {
    const counts: Record<string, number> = { COLD: 0, WARM: 0, HOT: 0, VERY_HOT: 0 };
    for (const r of rows) counts[r.temperature] = (counts[r.temperature] ?? 0) + 1;
    return counts;
  }, [rows]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["VERY_HOT", "HOT", "WARM", "COLD"] as OpportunityTemperature[]).map((t) => (
          <StatTile
            key={t}
            label={TEMPERATURE_META[t].label}
            value={spread[t] ?? 0}
            icon={TEMPERATURE_META[t].icon}
            color={TEMPERATURE_META[t].color}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          className="w-44"
        >
          <option value="">Any temperature</option>
          {Object.entries(TEMPERATURE_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        <div className="flex-1" />
        {can("Sales.FeedbackSubmit") && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New feedback
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-56" /></div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="MessageSquareText"
            title="No feedback yet"
            description="Debrief a meeting to score the opportunity."
            action={can("Sales.FeedbackSubmit") ? (
              <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New feedback</Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Link href={`/sales/leads/${f.lead.id}?tab=feedback`} className="block h-full">
                <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{f.lead.companyName}</h3>
                      <p className="text-xs text-muted-foreground">{f.lead.code}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold tabular-nums">{f.opportunityScore}</div>
                      <div className="text-[10px] text-muted-foreground">score</div>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <TemperatureBadge temperature={f.temperature} />
                    <StageBadge stage={f.lead.stage} />
                    {f.decisionMakerPresent && (
                      <Badge color="#22C55E" className="text-[10px]">Decision maker</Badge>
                    )}
                  </div>

                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <div>
                      Closing:{" "}
                      <span className="font-medium text-foreground">
                        {f.closingProbability !== null ? `${f.closingProbability}%` : "—"}
                      </span>
                    </div>
                    <div>
                      Timeline:{" "}
                      <span className="font-medium text-foreground">
                        {DECISION_TIMELINE_META[f.decisionTimeline].label}
                      </span>
                    </div>
                    {f.nextAction && (
                      <div className="truncate">
                        Next: <span className="text-foreground">{f.nextAction}</span>
                      </div>
                    )}
                    {f.nextMeetingDate && <div>Next meeting: {formatDate(f.nextMeetingDate)}</div>}
                  </dl>

                  <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <Avatar
                      firstName={f.author.firstName}
                      lastName={f.author.lastName}
                      src={f.author.avatarUrl}
                      size={20}
                    />
                    <span className="truncate">{f.author.firstName}</span>
                    <span className="ml-auto">{formatRelative(f.createdAt)}</span>
                    <ArrowRight className="size-3.5" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <FeedbackDialog
        open={open}
        onClose={() => {
          setOpen(false);
          if (params.get("new")) router.replace("/sales/feedback");
        }}
        leadPickerLeads={meta?.leads}
      />
    </div>
  );
}
