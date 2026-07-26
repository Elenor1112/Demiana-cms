"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  FileText, Download, ExternalLink, CheckCircle2, Clock, ShieldAlert,
  Loader2, History, Search, Users, FileWarning,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/fetcher";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import { formatBytes } from "@/components/job-description-upload";

type Tab = "mine" | "team";

export function JobDescriptionClient() {
  const [tab, setTab] = React.useState<Tab>("mine");
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [status, setStatus] = React.useState("");

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (dept) params.set("department", dept);
  if (status) params.set("status", status);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["job-descriptions", q, dept, status],
    queryFn: () => apiGet<any>(`/api/job-descriptions?${params}`),
  });

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<{ departments: { id: string; name: string }[] }>("/api/departments"),
    enabled: Boolean(data?.canViewAcknowledgments),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-destructive/30 py-16 text-center">
        <FileWarning className="size-9 text-destructive/50" />
        <p className="text-sm font-medium">Could not load your job description</p>
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message ?? "Please try again."}
        </p>
      </Card>
    );
  }

  const showTeamTab = Boolean(data.canViewAcknowledgments);

  return (
    <div className="space-y-5">
      {showTeamTab && (
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {(
            [
              { key: "mine" as const, label: "My Job Description" },
              { key: "team" as const, label: "Acknowledgment Status" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="jd-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {tab === "mine" || !showTeamTab ? (
            <MyJobDescription mine={data.mine} />
          ) : (
            <TeamRoster
              roster={data.roster}
              departments={deptData?.departments ?? []}
              q={q}
              setQ={setQ}
              dept={dept}
              setDept={setDept}
              status={status}
              setStatus={setStatus}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Employee view
// ─────────────────────────────────────────────────────────────

function MyJobDescription({ mine }: { mine: any }) {
  const qc = useQueryClient();
  const [confirmed, setConfirmed] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  const current = mine?.currentVersion ?? null;

  const ack = useMutation({
    mutationFn: () => apiSend(`/api/job-descriptions/versions/${current.id}/ack`, "POST"),
    onSuccess: () => {
      toast.success("Thank you — your acknowledgment has been recorded");
      qc.invalidateQueries({ queryKey: ["job-descriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
        <FileText className="size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">No job description assigned yet</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Your manager or HR hasn&apos;t uploaded your job description. You&apos;ll be notified
          here as soon as it&apos;s available.
        </p>
      </div>
    );
  }

  const fileUrl = `/api/job-descriptions/versions/${current.id}/file`;

  return (
    <div className="space-y-4">
      {!mine.acknowledged && (
        <Card className="flex items-center gap-3 border-warning/30 bg-warning/5 p-4">
          <ShieldAlert className="size-5 shrink-0 text-warning" />
          <span className="text-sm">
            {mine.versionCount > 1
              ? "An updated version of your job description has been published. Please review and acknowledge it."
              : "Please read your job description and confirm you understand it."}
          </span>
        </Card>
      )}

      {/* metadata */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{mine.title}</span>
              <Badge color="#06B6D4">v{current.version}</Badge>
              {mine.acknowledged ? (
                <Badge color="#22C55E">
                  <CheckCircle2 className="size-3" /> Acknowledged
                </Badge>
              ) : (
                <Badge color="#F59E0B">
                  <Clock className="size-3" /> Acknowledgment required
                </Badge>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
              <Meta label="Document" value={current.fileName} />
              <Meta label="Uploaded" value={formatDate(current.createdAt)} />
              <Meta
                label="Uploaded by"
                value={current.uploadedBy ? fullName(current.uploadedBy) : "—"}
              />
              <Meta label="Last updated" value={formatDate(mine.updatedAt)} />
            </div>
            {current.changeNote && (
              <p className="mt-3 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                <strong className="text-foreground">What changed:</strong> {current.changeNote}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={fileUrl} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="size-3.5" /> Open in new tab
              </Button>
            </a>
            <a href={`${fileUrl}?download=1`}>
              <Button size="sm" variant="outline">
                <Download className="size-3.5" /> Download
              </Button>
            </a>
          </div>
        </div>

        {mine.versionCount > 1 && (
          <div className="mt-4 border-t border-border pt-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <History className="size-3.5" />
              {showHistory ? "Hide" : "Show"} previous versions ({mine.versionCount - 1})
            </button>
            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-1.5">
                    {mine.history.map((v: any) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                      >
                        <Badge color={v.id === current.id ? "#06B6D4" : undefined}>
                          v{v.version}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{v.fileName}</span>
                        <span className="text-muted-foreground">{formatDate(v.createdAt)}</span>
                        <a
                          href={`/api/job-descriptions/versions/${v.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </Card>

      <PdfViewer src={fileUrl} fileName={current.fileName} size={current.size} />

      {/* acknowledgment */}
      {mine.acknowledged ? (
        <Card className="flex items-center gap-3 border-success/30 bg-success/5 p-4">
          <CheckCircle2 className="size-5 shrink-0 text-success" />
          <div className="text-sm">
            You acknowledged version {current.version} on{" "}
            <strong>{formatDateTime(mine.acknowledgedAt)}</strong>.
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[hsl(var(--primary))]"
            />
            <span className="text-sm">
              I have read and understood my Job Description.
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Your name, the document version and the time of confirmation will be recorded.
              </span>
            </span>
          </label>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => ack.mutate()} disabled={!confirmed || ack.isPending}>
              {ack.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Confirm acknowledgment
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}

/**
 * Embedded PDF viewer.
 *
 * Uses the browser's built-in PDF plugin via <object>, which avoids shipping a
 * renderer and keeps the bytes behind the authorized route. Browsers with no
 * plugin (notably iOS Safari) render the fallback, so there is always a way to
 * reach the document.
 */
function PdfViewer({ src, fileName, size }: { src: string; fileName: string; size: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2.5 text-xs text-muted-foreground">
        <FileText className="size-3.5" />
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">{fileName}</span>
        <span>{formatBytes(size)}</span>
      </div>
      <object data={src} type="application/pdf" className="h-[70vh] max-h-[900px] w-full">
        <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
          <FileText className="size-9 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Your browser can&apos;t display PDFs inline.
          </p>
          <div className="flex gap-2">
            <a href={src} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <ExternalLink className="size-3.5" /> Open
              </Button>
            </a>
            <a href={`${src}?download=1`}>
              <Button size="sm">
                <Download className="size-3.5" /> Download
              </Button>
            </a>
          </div>
        </div>
      </object>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Admin / manager roster
// ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  acknowledged: { label: "Acknowledged", color: "#22C55E" },
  pending: { label: "Pending", color: "#F59E0B" },
  missing: { label: "Not assigned", color: "#EF4444" },
};

function TeamRoster({
  roster,
  departments,
  q,
  setQ,
  dept,
  setDept,
  status,
  setStatus,
}: {
  roster: any;
  departments: { id: string; name: string }[];
  q: string;
  setQ: (v: string) => void;
  dept: string;
  setDept: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) {
  if (!roster) return null;
  const { rows, stats } = roster;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Employees" value={stats.total} color="#06B6D4" />
        <StatCard label="Acknowledged" value={stats.acknowledged} color="#22C55E" />
        <StatCard label="Pending" value={stats.pending} color="#F59E0B" />
        <StatCard label="Not assigned" value={stats.missing} color="#EF4444" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees…"
            className="pl-9"
          />
        </div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-48">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="pending">Pending</option>
          <option value="missing">Not assigned</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="size-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No employees match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Employee</th>
                <th className="px-4 py-2.5 font-medium">Department</th>
                <th className="px-4 py-2.5 font-medium">Version</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Acknowledged</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r: any) => {
                const meta = STATUS_META[r.status];
                const current = r.document?.currentVersion;
                return (
                  <tr key={r.employee.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/employees/${r.employee.id}`}
                        className="flex items-center gap-2.5 font-medium hover:text-primary"
                      >
                        <Avatar
                          firstName={r.employee.firstName}
                          lastName={r.employee.lastName}
                          src={r.employee.avatarUrl}
                          size={30}
                        />
                        <div>
                          <div>{fullName(r.employee)}</div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {r.employee.jobTitle ?? r.employee.role?.name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.employee.department ? (
                        <Badge color={r.employee.department.color}>
                          {r.employee.department.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {current ? `v${current.version}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge color={meta.color}>{meta.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.acknowledgedAt ? formatDateTime(r.acknowledgedAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {current && (
                        <a
                          href={`/api/job-descriptions/versions/${current.id}/file`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
      </div>
    </Card>
  );
}
