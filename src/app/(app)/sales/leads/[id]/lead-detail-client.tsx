"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Loader2, Mail, Phone, Globe, MapPin, Pencil, Sparkles,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/components/session-context";
import {
  StageBadge, ProbabilityBar, EmptyState, formatDate, formatRelative,
  type LeadListItem,
} from "@/components/sales/sales-bits";
import { LeadDialog } from "@/components/sales/lead-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import { ConvertDialog } from "@/components/sales/convert-dialog";
import {
  OverviewTab, TimelineTab, ActivitiesTab, MeetingsTab, DiscoveryTab,
  FeedbackTab, ProposalTab, TasksTab, FilesTab, CommentsTab, AuditTab,
  type LeadDetail,
} from "./lead-tabs";
import { LEAD_STAGE_ORDER, LEAD_STAGE_META, formatMoney } from "@/lib/sales-constants";
import type { LeadStage } from "@prisma/client";

const TABS = [
  "Overview", "Timeline", "Activities", "Meetings", "Discovery",
  "Feedback", "Proposal", "Tasks", "Files", "Comments", "Audit Log",
] as const;
type Tab = (typeof TABS)[number];

/** URL slug per tab, so a tab is linkable and survives a refresh. */
const TAB_SLUG: Record<Tab, string> = {
  Overview: "overview", Timeline: "timeline", Activities: "activities",
  Meetings: "meetings", Discovery: "discovery", Feedback: "feedback",
  Proposal: "proposal", Tasks: "tasks", Files: "files",
  Comments: "comments", "Audit Log": "audit",
};

export function LeadDetailClient({ leadId }: { leadId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [editOpen, setEditOpen] = React.useState(false);
  const [convertOpen, setConvertOpen] = React.useState(false);

  const slug = params.get("tab");
  const activeTab = (TABS.find((t) => TAB_SLUG[t] === slug) ?? "Overview") as Tab;

  function setTab(tab: Tab) {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", TAB_SLUG[tab]);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const queryKey = ["sales-lead", leadId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => apiGet<{ lead: LeadDetail }>(`/api/sales/leads/${leadId}`),
  });

  const changeStage = useMutation({
    mutationFn: (stage: LeadStage) => apiSend(`/api/sales/leads/${leadId}`, "PATCH", { stage }),
    onSuccess: () => {
      toast.success("Stage updated");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassign = useMutation({
    mutationFn: (ownerId: string) =>
      apiSend(`/api/sales/leads/${leadId}`, "PATCH", { ownerId: ownerId || null }),
    onSuccess: () => {
      toast.success("Owner updated");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon="SearchX"
        title="Lead not found"
        description="It may have been deleted, or you may not have access to it."
        action={<Button onClick={() => router.push("/sales/leads")}>Back to leads</Button>}
      />
    );
  }

  const lead = data.lead;
  const readOnly = meta?.scope === "converted";

  return (
    <div>
      <Link
        href="/sales/leads"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Leads
      </Link>

      {/* header */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Building2 className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">{lead.companyName}</h1>
                <StageBadge stage={lead.stage} />
                {lead.convertedClientId && <Badge color="#22C55E">Converted</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {lead.code}
                {lead.brandName ? ` · ${lead.brandName}` : ""}
                {lead.industry ? ` · ${lead.industry}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {lead.contactPerson && (
                  <span className="font-medium text-foreground">
                    {lead.contactPerson}
                    {lead.jobTitle ? ` · ${lead.jobTitle}` : ""}
                  </span>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-primary">
                    <Mail className="size-3" /> {lead.email}
                  </a>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-primary">
                    <Phone className="size-3" /> {lead.phone}
                  </a>
                )}
                {lead.website && (
                  <a
                    href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1 hover:text-primary"
                  >
                    <Globe className="size-3" /> {lead.website}
                  </a>
                )}
                {(lead.city || lead.country) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {[lead.city, lead.country].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {can("Sales.ChangeStage") && !readOnly && (
              <Select
                value={lead.stage}
                onChange={(e) => changeStage.mutate(e.target.value as LeadStage)}
                disabled={changeStage.isPending}
                className="w-44"
                aria-label="Lead stage"
              >
                {LEAD_STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>
                ))}
              </Select>
            )}
            {can("Sales.LeadEdit") && !readOnly && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {/* Conversion is the terminal action, so it only appears when it is
                actually available: won, not yet converted, and permitted. */}
            {lead.stage === "WON" && !lead.convertedClientId && can("Sales.Convert") && (
              <Button onClick={() => setConvertOpen(true)}>
                <Sparkles className="size-4" /> Convert to client
              </Button>
            )}
            {lead.convertedClient && (
              <Button variant="outline" onClick={() => router.push("/clients")}>
                <Building2 className="size-4" /> View client
              </Button>
            )}
          </div>
        </div>

        {/* commercial summary */}
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
          <Metric label="Deal value" value={formatMoney(lead.estimatedValue)} />
          <div>
            <div className="text-xs text-muted-foreground">Probability</div>
            <ProbabilityBar value={lead.probability} className="mt-1.5" />
          </div>
          <Metric label="Expected close" value={formatDate(lead.expectedCloseDate)} />
          <div>
            <div className="text-xs text-muted-foreground">Owner</div>
            {can("Sales.Assign") && meta && !readOnly ? (
              <Select
                value={lead.owner?.id ?? ""}
                onChange={(e) => reassign.mutate(e.target.value)}
                disabled={reassign.isPending}
                className="mt-1 h-8 text-xs"
                aria-label="Lead owner"
              >
                <option value="">Unassigned</option>
                {meta.salespeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
                ))}
              </Select>
            ) : (
              <div className="mt-1 flex items-center gap-1.5">
                {lead.owner ? (
                  <>
                    <Avatar
                      firstName={lead.owner.firstName}
                      lastName={lead.owner.lastName}
                      src={lead.owner.avatarUrl}
                      size={20}
                    />
                    <span className="truncate text-sm">
                      {lead.owner.firstName} {lead.owner.lastName}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Unassigned</span>
                )}
              </div>
            )}
          </div>
        </div>

        {lead.nextFollowUpAt && (
          <div className="mt-3 text-xs text-muted-foreground">
            Next follow-up {formatRelative(lead.nextFollowUpAt)} ·
            {" "}last activity {formatRelative(lead.lastActivityAt)}
          </div>
        )}
      </Card>

      {/* tabs */}
      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-max gap-1 border-b border-border">
          {TABS.map((tab) => {
            const active = tab === activeTab;
            const count = tabCount(tab, lead);
            return (
              <button
                key={tab}
                onClick={() => setTab(tab)}
                className={`relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
                {count !== null && count > 0 && (
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
                {active && (
                  <motion.span
                    layoutId="lead-tab-active"
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "Overview" && <OverviewTab lead={lead} />}
        {activeTab === "Timeline" && <TimelineTab lead={lead} />}
        {activeTab === "Activities" && <ActivitiesTab lead={lead} />}
        {activeTab === "Meetings" && <MeetingsTab lead={lead} readOnly={readOnly} />}
        {activeTab === "Discovery" && <DiscoveryTab lead={lead} readOnly={readOnly} />}
        {activeTab === "Feedback" && <FeedbackTab lead={lead} readOnly={readOnly} />}
        {activeTab === "Proposal" && <ProposalTab lead={lead} readOnly={readOnly} />}
        {activeTab === "Tasks" && <TasksTab lead={lead} />}
        {activeTab === "Files" && <FilesTab lead={lead} readOnly={readOnly} />}
        {activeTab === "Comments" && <CommentsTab lead={lead} />}
        {activeTab === "Audit Log" && <AuditTab lead={lead} />}
      </div>

      <LeadDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        lead={lead as unknown as LeadListItem}
        meta={meta}
      />
      <ConvertDialog
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        lead={lead}
        meta={meta}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

/** Badge counts per tab; null means "no counter". */
function tabCount(tab: Tab, lead: LeadDetail): number | null {
  switch (tab) {
    case "Meetings": return lead.meetings.length;
    case "Discovery": return lead.briefs.length;
    case "Feedback": return lead.feedback.length;
    case "Proposal": return lead.proposals.length;
    case "Tasks": return lead.tasks.length;
    case "Files": return lead.attachments.length;
    case "Comments": return lead.comments.length;
    case "Activities": return lead.activities.length;
    default: return null;
  }
}

export { Loader2 };
