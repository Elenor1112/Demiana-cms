"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/components/session-context";
import { LeadCard, type LeadListItem } from "@/components/sales/sales-bits";
import { LeadDialog } from "@/components/sales/lead-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import {
  PIPELINE_COLUMNS, LEAD_STAGE_META, formatCompactMoney,
} from "@/lib/sales-constants";
import type { LeadStage } from "@prisma/client";

export function PipelineClient() {
  const router = useRouter();
  const qc = useQueryClient();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [q, setQ] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<LeadStage | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  /** A move to LOST pauses for a reason — the Loss Reasons report depends on it. */
  const [lossPrompt, setLossPrompt] = React.useState<{ id: string; company: string } | null>(null);
  const [lostReason, setLostReason] = React.useState("");

  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qp = new URLSearchParams();
  if (debouncedQ) qp.set("q", debouncedQ);
  if (owner) qp.set("owner", owner);

  const queryKey = React.useMemo(
    () => ["sales-leads", "pipeline", debouncedQ, owner],
    [debouncedQ, owner]
  );

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<{ leads: LeadListItem[] }>(`/api/sales/leads?${qp.toString()}`),
  });

  const move = useMutation({
    mutationFn: ({ id, stage, reason }: { id: string; stage: LeadStage; reason?: string }) =>
      apiSend(`/api/sales/leads/${id}`, "PATCH", {
        stage,
        ...(reason ? { lostReason: reason } : {}),
      }),
    // Optimistic move so the card lands under the cursor immediately; rolled
    // back on failure. Same contract as the task board's kanban.
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ leads: LeadListItem[] }>(queryKey);
      qc.setQueryData<{ leads: LeadListItem[] }>(queryKey, (old) =>
        old ? { leads: old.leads.map((l) => (l.id === id ? { ...l, stage } : l)) } : old
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e.message || "Couldn't move that deal");
    },
    onSuccess: (_r, v) => {
      if (v.stage === "WON") toast.success("Deal won — convert it to a client from the lead page.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
  });

  const canDrag = can("Sales.ChangeStage");

  function onDrop(stage: LeadStage) {
    const id = dragId;
    setDragId(null);
    setOverCol(null);
    if (!id) return;

    const lead = data?.leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;

    if (stage === "LOST") {
      setLossPrompt({ id, company: lead.companyName });
      setLostReason("");
      return;
    }
    move.mutate({ id, stage });
  }

  const leads = data?.leads ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the pipeline…"
            className="pl-9"
          />
        </div>
        {meta?.scope === "all" && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">Any owner</option>
            {meta.salespeople.map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </Select>
        )}
        {can("Sales.LeadCreate") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New lead
          </Button>
        )}
      </div>

      {!canDrag && (
        <p className="mt-3 text-xs text-muted-foreground">
          You have read-only access to the pipeline — moving deals requires the
          stage-change permission.
        </p>
      )}

      {isLoading ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_COLUMNS.map((s) => (
            <Skeleton key={s} className="h-96 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_COLUMNS.map((stage) => {
            const meta = LEAD_STAGE_META[stage];
            const colLeads = leads.filter((l) => l.stage === stage);
            const colValue = colLeads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

            return (
              <div
                key={stage}
                onDragOver={(e) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  setOverCol(stage);
                }}
                onDragLeave={() => setOverCol((c) => (c === stage ? null : c))}
                onDrop={() => onDrop(stage)}
                className={`flex w-72 shrink-0 flex-col rounded-xl border transition-colors ${
                  overCol === stage ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
                }`}
              >
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span className="text-sm font-semibold">{meta.label}</span>
                    <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">
                      {colLeads.length}
                    </span>
                  </div>
                  {colValue > 0 && (
                    <div className="mt-0.5 pl-[18px] text-[11px] text-muted-foreground">
                      {formatCompactMoney(colValue)}
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ minHeight: 140 }}>
                  {colLeads.map((lead) => (
                    <motion.div
                      key={lead.id}
                      layout
                      draggable={canDrag}
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => setDragId(null)}
                    >
                      <LeadCard
                        lead={lead}
                        dragging={dragId === lead.id}
                        onClick={() => router.push(`/sales/leads/${lead.id}`)}
                      />
                    </motion.div>
                  ))}
                  {colLeads.length === 0 && (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      {canDrag ? "Drop here" : "Empty"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LeadDialog open={createOpen} onClose={() => setCreateOpen(false)} meta={meta} />

      {/* Losing a deal asks why, once, at the moment the information is fresh. */}
      <Dialog
        open={Boolean(lossPrompt)}
        onClose={() => setLossPrompt(null)}
        title={`Why was ${lossPrompt?.company ?? "this deal"} lost?`}
        description="This feeds the Loss Reasons report. You can leave it blank."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="e.g. Budget too low, went with a competitor, timing"
              rows={3}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLossPrompt(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (lossPrompt) {
                  move.mutate({
                    id: lossPrompt.id,
                    stage: "LOST",
                    reason: lostReason.trim() || undefined,
                  });
                }
                setLossPrompt(null);
              }}
            >
              Mark as lost
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
