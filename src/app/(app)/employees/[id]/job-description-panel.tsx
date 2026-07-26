"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  FileText, Download, ExternalLink, Loader2, Trash2, History,
  CheckCircle2, Clock, UploadCloud,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { JobDescriptionUpload, formatBytes } from "@/components/job-description-upload";
import { apiGet, apiSend, apiUpload } from "@/lib/fetcher";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";
import { useCan } from "@/components/session-context";

/**
 * Job description management for a single employee, shown on their profile.
 *
 * Uploading here is the same operation as uploading from the Add Employee
 * form — it appends a version to the one document that employee owns and
 * re-points it, so the assignment stays a single source of truth.
 */
export function JobDescriptionPanel({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const canUpload = can("JobDescription.Upload");
  const canDelete = can("JobDescription.Delete");

  const [file, setFile] = React.useState<File | null>(null);
  const [changeNote, setChangeNote] = React.useState("");
  const [showHistory, setShowHistory] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const queryKey = ["job-description", employeeId];
  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => apiGet<any>(`/api/employees/${employeeId}/job-description`),
  });

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append("file", file as File);
      if (changeNote.trim()) form.append("changeNote", changeNote.trim());
      return apiUpload<any>(`/api/employees/${employeeId}/job-description`, form);
    },
    onSuccess: (res: any) => {
      toast.success(
        res.version.version === 1
          ? "Job description uploaded"
          : `Version ${res.version.version} published — ${employeeName} will be asked to acknowledge it`
      );
      setFile(null);
      setChangeNote("");
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["job-descriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => apiSend(`/api/employees/${employeeId}/job-description`, "DELETE"),
    onSuccess: () => {
      toast.success("Job description removed");
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["job-descriptions"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmDelete(false);
    },
  });

  if (isLoading) return <Skeleton className="h-56 rounded-xl" />;

  if (isError) {
    return (
      <Card className="flex flex-col items-center justify-center gap-2 border-destructive/30 py-12 text-center">
        <FileText className="size-8 text-destructive/50" />
        <p className="text-sm text-muted-foreground">
          {(error as Error)?.message ?? "Could not load the job description."}
        </p>
      </Card>
    );
  }

  const doc = data?.document ?? null;
  const current = doc?.currentVersion ?? null;
  const versions: any[] = doc?.versions ?? [];

  return (
    <div className="space-y-4">
      {current ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{current.fileName}</span>
                <Badge color="#06B6D4">v{current.version}</Badge>
                {data.acknowledged ? (
                  <Badge color="#22C55E">
                    <CheckCircle2 className="size-3" /> Acknowledged
                  </Badge>
                ) : (
                  <Badge color="#F59E0B">
                    <Clock className="size-3" /> Awaiting acknowledgment
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatBytes(current.size)} · Uploaded {formatDateTime(current.createdAt)}
                {current.uploadedBy && <> by {fullName(current.uploadedBy)}</>}
              </div>
              {data.acknowledged && (
                <div className="mt-0.5 text-xs text-success">
                  Acknowledged {formatDateTime(data.acknowledgedAt)}
                </div>
              )}
              {current.changeNote && (
                <p className="mt-2 rounded-lg bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">
                  {current.changeNote}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/api/job-descriptions/versions/${current.id}/file`}
                target="_blank"
                rel="noreferrer"
              >
                <Button size="sm" variant="outline">
                  <ExternalLink className="size-3.5" /> Open
                </Button>
              </a>
              <a href={`/api/job-descriptions/versions/${current.id}/file?download=1`}>
                <Button size="sm" variant="outline">
                  <Download className="size-3.5" /> Download
                </Button>
              </a>
              {canDelete && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>

          {versions.length > 1 && (
            <div className="mt-4 border-t border-border pt-3">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <History className="size-3.5" />
                {showHistory ? "Hide" : "Show"} version history ({versions.length})
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
                      {versions.map((v) => (
                        <div
                          key={v.id}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs"
                        >
                          <Badge color={v.id === current.id ? "#06B6D4" : undefined}>
                            v{v.version}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate font-medium">{v.fileName}</span>
                          <span className="text-muted-foreground">
                            {formatDate(v.createdAt)}
                            {v.uploadedBy && <> · {fullName(v.uploadedBy)}</>}
                          </span>
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
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
          <FileText className="size-9 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No job description assigned to {employeeName} yet.
          </p>
        </div>
      )}

      {canUpload && (
        <Card className="p-5">
          <div className="mb-3">
            <Label>{current ? "Upload a new version" : "Upload job description"}</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {current
                ? "The previous version is kept in history. The employee will need to acknowledge the new one."
                : "PDF only. The employee will be notified and asked to acknowledge it."}
            </p>
          </div>
          <JobDescriptionUpload
            file={file}
            onChange={setFile}
            currentFileName={current?.fileName}
            disabled={upload.isPending}
          />
          {file && (
            <div className="mt-3 space-y-1.5">
              <Label>What changed? (optional)</Label>
              <Input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                placeholder="e.g. Updated reporting line and KPIs"
                disabled={upload.isPending}
              />
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              {current ? "Publish new version" : "Upload"}
            </Button>
          </div>
        </Card>
      )}

      <ConfirmDeleteDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
        title="Remove job description"
        description={`This removes ${employeeName}'s job description, every version of it, and the acknowledgment history.`}
        archiveNote="To publish a revision instead, upload a new version — that keeps the full history intact."
        confirmLabel="Remove document"
      />
    </div>
  );
}
