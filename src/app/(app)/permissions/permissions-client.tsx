"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Clock, Loader2, AlertTriangle } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { REQUEST_STATUS_META } from "@/lib/constants";
import { formatDate, todayInputMin, notInThePast } from "@/lib/utils";
import { useSession } from "@/components/session-context";

const TYPE_LABELS: Record<string, string> = {
  LATE_ARRIVAL: "Late Arrival", EARLY_LEAVE: "Early Leave", TEMPORARY_LEAVE: "Temporary Leave",
  MEDICAL_APPOINTMENT: "Medical Appointment", EMERGENCY: "Emergency", OTHER: "Other",
};

type Perm = {
  id: string; type: string; date: string; fromTime?: string | null; toTime?: string | null;
  reason: string; status: string; rejectionReason?: string | null;
  requester: { id: string; firstName: string; lastName: string; avatarUrl?: string | null; jobTitle?: string | null };
};

export function PermissionsClient() {
  const me = useSession();
  const qc = useQueryClient();
  const canApprove = me.isSuperAdmin || me.permissions.includes("Permission.Approve");
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["perms", scope],
    queryFn: () => apiGet<{ requests: Perm[] }>(`/api/permissions-requests?scope=${scope}`),
  });

  const submit = useMutation({
    mutationFn: (v: any) => apiSend("/api/permissions-requests", "POST", v),
    onSuccess: () => { toast.success("Permission request submitted"); qc.invalidateQueries({ queryKey: ["perms"] }); reset(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; action: string; comment?: string }) => apiSend(`/api/permissions-requests/${v.id}`, "PATCH", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["perms"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canApprove && (
          <div className="flex rounded-lg border border-border p-0.5 text-sm">
            {(["mine", "all"] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)} className={`rounded-md px-3 py-1.5 font-medium ${scope === s ? "bg-secondary" : "text-muted-foreground"}`}>
                {s === "mine" ? "My requests" : "All requests"}
              </button>
            ))}
          </div>
        )}
        <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Request permission</Button>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : !data?.requests.length ? (
        <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Clock className="size-9 text-muted-foreground/40" /><p className="mt-3 text-sm text-muted-foreground">No permission requests.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {data.requests.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <Avatar firstName={r.requester.firstName} lastName={r.requester.lastName} src={r.requester.avatarUrl} size={38} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.requester.firstName} {r.requester.lastName}</span>
                      <Badge color="#0EA5E9">{TYPE_LABELS[r.type]}</Badge>
                      <Badge color={REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.color}>
                        {REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.label}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(r.date)}{r.fromTime ? ` · ${r.fromTime}${r.toTime ? `–${r.toTime}` : ""}` : ""} — {r.reason}
                    </div>
                    {r.status === "REJECTED" && r.rejectionReason && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> {r.rejectionReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.status === "PENDING" && scope === "mine" && r.requester.id === me.id && (
                    <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, action: "cancel" })}>Cancel</Button>
                  )}
                  {r.status === "PENDING" && scope === "all" && canApprove && r.requester.id !== me.id && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => { const c = prompt("Rejection reason?"); if (c !== null) decide.mutate({ id: r.id, action: "reject", comment: c }); }}>Reject</Button>
                      <Button size="sm" onClick={() => decide.mutate({ id: r.id, action: "approve" })}>Approve</Button>
                    </>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="Request permission" className="max-w-lg">
        <form onSubmit={handleSubmit((v) => submit.mutate(v))} className="space-y-4">
          <div className="space-y-1.5"><Label>Type</Label>
            <Select {...register("type")} defaultValue="LATE_ARRIVAL">
              {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                min={todayInputMin()}
                {...register("date", { required: true, validate: notInThePast("Date") })}
              />
              {errors.date?.message && (
                <p className="text-xs text-destructive">{String(errors.date.message)}</p>
              )}
            </div>
            <div className="space-y-1.5"><Label>From</Label><Input type="time" {...register("fromTime")} /></div>
            <div className="space-y-1.5"><Label>To</Label><Input type="time" {...register("toTime")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Reason</Label><Textarea {...register("reason", { required: true })} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submit.isPending}>{submit.isPending && <Loader2 className="size-4 animate-spin" />} Submit</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
