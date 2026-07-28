"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Plus, Search, LayoutGrid, Table2, Trash2, Pencil, Mail, Phone, Globe, MapPin,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useCan } from "@/components/session-context";
import {
  LeadCard, StageBadge, ProbabilityBar, EmptyState, CardGridSkeleton,
  formatDate, formatRelative, type LeadListItem,
} from "@/components/sales/sales-bits";
import { LeadDialog } from "@/components/sales/lead-dialog";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import {
  LEAD_STAGE_ORDER, LEAD_STAGE_META, LEAD_PRIORITY_META, LEAD_SOURCE_META,
  formatCompactMoney,
} from "@/lib/sales-constants";

type View = "cards" | "table";

export function LeadsClient() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const can = useCan();
  const { data: meta } = useSalesMeta();

  const [view, setView] = React.useState<View>("cards");
  const [q, setQ] = React.useState("");
  // Deep links from the dashboard and command palette seed the filters.
  const [stage, setStage] = React.useState(params.get("stage") ?? "");
  const [owner, setOwner] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [source, setSource] = React.useState("");
  const followupDue = params.get("followup") === "due";

  const [createOpen, setCreateOpen] = React.useState(params.get("new") === "1");
  const [editing, setEditing] = React.useState<LeadListItem | null>(null);
  const [deleting, setDeleting] = React.useState<LeadListItem | null>(null);

  // Debounce the text search so typing does not fire a request per keystroke.
  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qp = new URLSearchParams();
  if (debouncedQ) qp.set("q", debouncedQ);
  if (stage) qp.set("stage", stage);
  if (owner) qp.set("owner", owner);
  if (priority) qp.set("priority", priority);
  if (source) qp.set("source", source);

  const queryKey = ["sales-leads", debouncedQ, stage, owner, priority, source];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<{ leads: LeadListItem[] }>(`/api/sales/leads?${qp.toString()}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend<{ message?: string }>(`/api/sales/leads/${id}`, "DELETE"),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Lead deleted");
      qc.invalidateQueries({ queryKey: ["sales-leads"] });
      qc.invalidateQueries({ queryKey: ["sales-dashboard"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // The "follow-ups due" deep link is a client-side narrowing of the same
  // result set rather than another API parameter — the dashboard already
  // counts it server-side, and this keeps one list endpoint.
  const leads = React.useMemo(() => {
    const rows = data?.leads ?? [];
    if (!followupDue) return rows;
    const now = Date.now();
    return rows.filter(
      (l) => l.nextFollowUpAt && new Date(l.nextFollowUpAt).getTime() <= now
    );
  }, [data, followupDue]);

  const canCreate = can("Sales.LeadCreate");

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          {([
            { key: "cards", label: "Cards", icon: LayoutGrid },
            { key: "table", label: "Table", icon: Table2 },
          ] as const).map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                view === v.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <v.icon className="size-4" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company, contact, code…"
            className="pl-9"
          />
        </div>

        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-40">
          <option value="">Any stage</option>
          {LEAD_STAGE_ORDER.map((s) => (
            <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>
          ))}
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-36">
          <option value="">Any priority</option>
          {Object.entries(LEAD_PRIORITY_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        <Select value={source} onChange={(e) => setSource(e.target.value)} className="w-40">
          <option value="">Any source</option>
          {Object.entries(LEAD_SOURCE_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        {/* Owner filter only matters when you can see other people's leads. */}
        {meta?.scope === "all" && (
          <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-44">
            <option value="">Any owner</option>
            {meta.salespeople.map((p) => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </Select>
        )}

        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New lead
          </Button>
        )}
      </div>

      {followupDue && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <span className="font-medium text-destructive">Showing overdue follow-ups only.</span>
          <button
            onClick={() => router.replace("/sales/leads")}
            className="text-xs text-primary hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* results */}
      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton /></div>
      ) : leads.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="UserSearch"
            title="No leads found"
            description={
              debouncedQ || stage || priority || source
                ? "Try clearing the filters."
                : "Add your first lead to start building the pipeline."
            }
            action={
              canCreate && !debouncedQ ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> New lead
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : view === "cards" ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead, i) => (
            <motion.div
              key={lead.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <LeadDetailCard
                lead={lead}
                onEdit={() => setEditing(lead)}
                onDelete={() => setDeleting(lead)}
                canEdit={can("Sales.LeadEdit")}
                canDelete={can("Sales.LeadDelete")}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        <LeadTable leads={leads} />
      )}

      <LeadDialog
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          // Drop ?new=1 so a refresh does not reopen the dialog.
          if (params.get("new")) router.replace("/sales/leads");
        }}
        meta={meta}
      />
      <LeadDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        lead={editing}
        meta={meta}
      />

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete ${deleting?.companyName ?? "lead"}?`}
        description="This permanently removes the lead and all of its meetings, briefs, feedback and proposals."
        pending={remove.isPending}
      />
    </div>
  );
}

/** Richer card for the list view — the pipeline board uses the compact LeadCard. */
function LeadDetailCard({
  lead,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  lead: LeadListItem;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/sales/leads/${lead.id}`}
            className="truncate font-semibold hover:text-primary hover:underline"
          >
            {lead.companyName}
          </Link>
          <p className="text-xs text-muted-foreground">
            {lead.code}
            {lead.industry ? ` · ${lead.industry}` : ""}
          </p>
        </div>
        <StageBadge stage={lead.stage} />
      </div>

      {lead.contactPerson && (
        <p className="mt-2.5 text-sm">
          {lead.contactPerson}
          {lead.jobTitle && (
            <span className="text-muted-foreground"> · {lead.jobTitle}</span>
          )}
        </p>
      )}

      <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        {lead.email && (
          <div className="flex items-center gap-1.5 truncate">
            <Mail className="size-3 shrink-0" /> {lead.email}
          </div>
        )}
        {lead.phone && (
          <div className="flex items-center gap-1.5"><Phone className="size-3 shrink-0" /> {lead.phone}</div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 truncate">
            <Globe className="size-3 shrink-0" /> {lead.website}
          </div>
        )}
        {(lead.city || lead.country) && (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3 shrink-0" />
            {[lead.city, lead.country].filter(Boolean).join(", ")}
          </div>
        )}
      </div>

      {lead.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {lead.tags.slice(0, 4).map((t) => (
            <Badge key={t} className="text-[10px]">{t}</Badge>
          ))}
          {lead.tags.length > 4 && (
            <Badge className="text-[10px]">+{lead.tags.length - 4}</Badge>
          )}
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-lg font-bold">{formatCompactMoney(lead.estimatedValue)}</span>
        <span className="text-xs text-muted-foreground">
          close {formatDate(lead.expectedCloseDate)}
        </span>
      </div>
      <ProbabilityBar value={lead.probability} className="mt-1.5" />

      {/* mt-auto pins the footer so cards in a row line up regardless of body height */}
      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        {lead.owner ? (
          <>
            <Avatar
              firstName={lead.owner.firstName}
              lastName={lead.owner.lastName}
              src={lead.owner.avatarUrl}
              size={22}
            />
            <span className="truncate">{lead.owner.firstName} {lead.owner.lastName}</span>
          </>
        ) : (
          <span>Unassigned</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <button
              onClick={onEdit}
              aria-label={`Edit ${lead.companyName}`}
              className="rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              aria-label={`Delete ${lead.companyName}`}
              className="rounded-md p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function LeadTable({ leads }: { leads: LeadListItem[] }) {
  return (
    // The wrapper scrolls, not the page — wide tables must never push the body
    // into horizontal scroll on a phone.
    <div className="mt-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left">
          <tr className="text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-semibold">Company</th>
            <th className="px-4 py-2.5 font-semibold">Contact</th>
            <th className="px-4 py-2.5 font-semibold">Stage</th>
            <th className="px-4 py-2.5 font-semibold">Owner</th>
            <th className="px-4 py-2.5 text-right font-semibold">Value</th>
            <th className="px-4 py-2.5 font-semibold">Probability</th>
            <th className="px-4 py-2.5 font-semibold">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-accent/40">
              <td className="px-4 py-2.5">
                <Link href={`/sales/leads/${lead.id}`} className="font-medium hover:text-primary hover:underline">
                  {lead.companyName}
                </Link>
                <div className="text-xs text-muted-foreground">{lead.code}</div>
              </td>
              <td className="px-4 py-2.5">
                <div className="truncate">{lead.contactPerson ?? "—"}</div>
                <div className="truncate text-xs text-muted-foreground">{lead.email ?? ""}</div>
              </td>
              <td className="px-4 py-2.5"><StageBadge stage={lead.stage} /></td>
              <td className="px-4 py-2.5">
                {lead.owner ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      firstName={lead.owner.firstName}
                      lastName={lead.owner.lastName}
                      src={lead.owner.avatarUrl}
                      size={20}
                    />
                    <span className="truncate">{lead.owner.firstName}</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                {formatCompactMoney(lead.estimatedValue)}
              </td>
              <td className="px-4 py-2.5"><ProbabilityBar value={lead.probability} /></td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">
                {formatRelative(lead.lastActivityAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
