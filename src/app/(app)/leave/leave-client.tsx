"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Plane, Loader2, AlertTriangle } from "lucide-react";
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
import { REQUEST_STATUS_META, LEAVE_TYPE_META } from "@/lib/constants";
import { formatDate, todayInputMin, notInThePast } from "@/lib/utils";
import { useSession } from "@/components/session-context";

type Leave = {
  id: string; type: string; startDate: string; endDate: string; days: number;
  reason: string; status: string; rejectionReason?: string | null;
  requester: { id: string; firstName: string; lastName: string; avatarUrl?: string | null; jobTitle?: string | null };
  actingUser?: { firstName: string; lastName: string } | null;
};

export function LeaveClient() {
  const me = useSession();
  const qc = useQueryClient();
  const canApprove = me.isSuperAdmin || me.permissions.includes("Leave.Approve");
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [open, setOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["leave", scope],
    queryFn: () => apiGet<{ requests: Leave[] }>(`/api/leave?scope=${scope}`),
  });

  const decide = useMutation({
    mutationFn: (v: { id: string; action: string; comment?: string }) =>
      apiSend(`/api/leave/${v.id}`, "PATCH", { action: v.action, comment: v.comment }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leave"] }); qc.invalidateQueries({ queryKey: ["approvals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div />
        <div className="flex items-center gap-2">
          {canApprove && (
            <div className="flex rounded-lg border border-border p-0.5 text-sm">
              {(["mine", "all"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1.5 font-medium capitalize ${scope === s ? "bg-secondary" : "text-muted-foreground"}`}>
                  {s === "mine" ? "My requests" : "All requests"}
                </button>
              ))}
            </div>
          )}
          <Button onClick={() => setOpen(true)}><Plus className="size-4" /> Request leave</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : !data?.requests.length ? (
        <Empty />
      ) : (
        <div className="mt-4 space-y-2">
          {data.requests.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar firstName={r.requester.firstName} lastName={r.requester.lastName} src={r.requester.avatarUrl} size={40} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.requester.firstName} {r.requester.lastName}</span>
                        <Badge color="#06B6D4">{LEAVE_TYPE_META[r.type as keyof typeof LEAVE_TYPE_META]?.label}</Badge>
                        <Badge color={REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.color}>
                          {REQUEST_STATUS_META[r.status as keyof typeof REQUEST_STATUS_META]?.label}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.days} day{r.days !== 1 ? "s" : ""}
                      </div>
                      <p className="mt-1 text-sm">{r.reason}</p>
                      {r.actingUser && <p className="mt-0.5 text-xs text-muted-foreground">Acting: {r.actingUser.firstName} {r.actingUser.lastName}</p>}
                      {r.status === "REJECTED" && r.rejectionReason && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="size-3" /> {r.rejectionReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "PENDING" && scope === "mine" && r.requester.id === me.id && (
                      <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: r.id, action: "cancel" })}>Cancel</Button>
                    )}
                    {r.status === "PENDING" && scope === "all" && canApprove && r.requester.id !== me.id && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => {
                          const c = prompt("Rejection reason?"); if (c !== null) decide.mutate({ id: r.id, action: "reject", comment: c });
                        }}>Reject</Button>
                        <Button size="sm" onClick={() => decide.mutate({ id: r.id, action: "approve" })}>Approve</Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <LeaveForm open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function Empty() {
  return (
    <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
      <Plane className="size-9 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">No leave requests yet.</p>
    </div>
  );
}

function LeaveForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<any>();
  const [warnings, setWarnings] = React.useState<string[]>([]);

  const { data: emps } = useQuery({
    queryKey: ["employees-min"],
    queryFn: () => apiGet<{ employees: any[] }>("/api/employees"),
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: (v: any) => apiSend("/api/leave", "POST", { ...v, declaration: !!v.declaration }),
    onSuccess: (res: any) => {
      toast.success("Leave request submitted");
      if (res.warnings?.length) res.warnings.forEach((w: string) => toast.warning(w));
      qc.invalidateQueries({ queryKey: ["leave"] });
      reset(); setWarnings([]); onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onClose={onClose} title="Request leave" description="Complete the leave request form." className="max-w-xl">
      <form onSubmit={handleSubmit((v) => submit.mutate(v))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Leave type</Label>
            <Select {...register("type")} defaultValue="ANNUAL">
              {Object.entries(LEAVE_TYPE_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Acting employee</Label>
            <Select {...register("actingUserId")} defaultValue="">
              <option value="">Select…</option>
              {emps?.employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input
              type="date"
              min={todayInputMin()}
              {...register("startDate", { required: true, validate: notInThePast("Start date") })}
            />
            {errors.startDate?.message && (
              <p className="text-xs text-destructive">{String(errors.startDate.message)}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Input
              type="date"
              min={todayInputMin()}
              {...register("endDate", { required: true, validate: notInThePast("End date") })}
            />
            {errors.endDate?.message && (
              <p className="text-xs text-destructive">{String(errors.endDate.message)}</p>
            )}
          </div>
        </div>
        <div className="space-y-1.5"><Label>Reason</Label><Textarea {...register("reason", { required: true })} placeholder="Reason for leave…" /></div>
        <div className="space-y-1.5"><Label>Work handover</Label><Textarea {...register("handover", { required: true })} placeholder="How will your work be covered?" /></div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" {...register("declaration")} className="mt-0.5 accent-primary" />
          <span className="text-muted-foreground">I declare the information provided is accurate and I have arranged a proper handover.</span>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={submit.isPending}>{submit.isPending && <Loader2 className="size-4 animate-spin" />} Submit request</Button>
        </div>
      </form>
    </Dialog>
  );
}
