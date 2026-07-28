"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus, ArrowRight, Eye } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { useCan } from "@/components/session-context";
import {
  EmptyState, CardGridSkeleton, StatTile, Icon, formatDate, formatRelative,
  type PersonRef,
} from "@/components/sales/sales-bits";
import { ProposalDialog } from "@/components/sales/proposal-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import {
  PROPOSAL_STATUS_META, PROPOSAL_EVENT_META, formatMoney, formatCompactMoney,
} from "@/lib/sales-constants";
import type { LeadStage, ProposalEventType, ProposalStatus } from "@prisma/client";

type ProposalRow = {
  id: string; version: number; title: string; summary: string | null;
  amount: number | null; currency: string; status: ProposalStatus;
  preparedAt: string; sentAt: string | null; openedAt: string | null;
  downloadedAt: string | null; acceptedAt: string | null; rejectedAt: string | null;
  contractSignedAt: string | null; validUntil: string | null;
  revisionCount: number; viewCount: number;
  lead: { id: string; code: string; companyName: string; stage: LeadStage };
  preparedBy: PersonRef;
  events: {
    id: string; type: ProposalEventType; note: string | null;
    createdAt: string; actor: PersonRef | null;
  }[];
  _count: { attachments: number };
};

export function ProposalsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [status, setStatus] = React.useState("");
  const [open, setOpen] = React.useState(params.get("new") === "1");

  const qp = new URLSearchParams();
  if (status) qp.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-proposals", status],
    queryFn: () => apiGet<{ proposals: ProposalRow[] }>(`/api/sales/proposals?${qp.toString()}`),
  });

  const proposals = data?.proposals ?? [];

  const stats = React.useMemo(() => {
    const waiting = proposals.filter((p) =>
      ["SENT", "VIEWED", "UNDER_REVISION"].includes(p.status)
    );
    const accepted = proposals.filter((p) => p.status === "ACCEPTED");
    const rejected = proposals.filter((p) => p.status === "REJECTED");
    const decided = accepted.length + rejected.length;
    return {
      waiting: waiting.length,
      accepted: accepted.length,
      acceptanceRate: decided ? Math.round((accepted.length / decided) * 100) : 0,
      value: accepted.reduce((s, p) => s + (p.amount ?? 0), 0),
    };
  }, [proposals]);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting decision" value={stats.waiting} icon="Clock" color="#F59E0B" />
        <StatTile label="Accepted" value={stats.accepted} icon="CheckCircle2" color="#22C55E" />
        <StatTile label="Acceptance rate" value={`${stats.acceptanceRate}%`} icon="Percent" color="#06B6D4" />
        <StatTile label="Value won" value={formatCompactMoney(stats.value)} icon="Wallet" color="#8B5CF6" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">Any status</option>
          {Object.entries(PROPOSAL_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        <div className="flex-1" />
        {can("Sales.ProposalManage") && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" /> New proposal
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-56" /></div>
      ) : proposals.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="FileBadge"
            title="No proposals yet"
            description="Draft a proposal from a lead once discovery is complete."
            action={can("Sales.ProposalManage") ? (
              <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New proposal</Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {proposals.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Link href={`/sales/leads/${p.lead.id}?tab=proposal`} className="block h-full">
                <Card className="flex h-full flex-col p-5 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="truncate font-semibold">{p.title}</h3>
                        <Badge className="text-[10px]">v{p.version}</Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.lead.companyName} · {p.lead.code}
                      </p>
                    </div>
                    <Badge color={PROPOSAL_STATUS_META[p.status].color}>
                      {PROPOSAL_STATUS_META[p.status].label}
                    </Badge>
                  </div>

                  <div className="mt-2.5 flex items-baseline justify-between">
                    <span className="text-lg font-bold">{formatMoney(p.amount, p.currency)}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="size-3" /> {p.viewCount}
                      {p.revisionCount > 0 && ` · ${p.revisionCount} rev`}
                    </span>
                  </div>

                  {/* The lifecycle, as a compact strip of reached milestones. */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Milestone label="Prepared" at={p.preparedAt} />
                    <Milestone label="Sent" at={p.sentAt} />
                    <Milestone label="Opened" at={p.openedAt} />
                    <Milestone label="Downloaded" at={p.downloadedAt} />
                    <Milestone label="Accepted" at={p.acceptedAt} good />
                    <Milestone label="Rejected" at={p.rejectedAt} bad />
                    <Milestone label="Signed" at={p.contractSignedAt} good />
                  </div>

                  {p.events[0] && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Icon name={PROPOSAL_EVENT_META[p.events[0].type].icon} className="size-3" />
                      Last: {PROPOSAL_EVENT_META[p.events[0].type].label} ·{" "}
                      {formatRelative(p.events[0].createdAt)}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                    <Avatar
                      firstName={p.preparedBy.firstName}
                      lastName={p.preparedBy.lastName}
                      src={p.preparedBy.avatarUrl}
                      size={20}
                    />
                    <span className="truncate">{p.preparedBy.firstName}</span>
                    {p.validUntil && <span>· valid to {formatDate(p.validUntil)}</span>}
                    <ArrowRight className="ml-auto size-3.5" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <ProposalDialog
        open={open}
        onClose={() => {
          setOpen(false);
          if (params.get("new")) router.replace("/sales/proposals");
        }}
        leadPickerLeads={meta?.leads}
      />
    </div>
  );
}

/** One lifecycle milestone; dimmed until it has actually happened. */
function Milestone({
  label,
  at,
  good,
  bad,
}: {
  label: string;
  at: string | null;
  good?: boolean;
  bad?: boolean;
}) {
  if (!at) {
    return (
      <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
        {label}
      </span>
    );
  }
  const color = good ? "#22C55E" : bad ? "#EF4444" : "#0EA5E9";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ color, backgroundColor: `${color}1A` }}
      title={formatDate(at)}
    >
      {label}
    </span>
  );
}
