"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiGet, apiSend } from "@/lib/fetcher";
import { PRIORITY_META } from "@/lib/constants";

type Meta = {
  projects: { id: string; name: string }[];
  clients: { id: string; company: string }[];
  labels: { id: string; name: string; color: string }[];
  departments: { id: string; name: string; color: string }[];
  assignable: { id: string; firstName: string; lastName: string; avatarUrl?: string | null; role: { name: string } }[];
};

export function CreateTaskDialog({
  open,
  onClose,
  defaultProjectId,
  defaultParentId,
}: {
  open: boolean;
  onClose: () => void;
  defaultProjectId?: string;
  defaultParentId?: string;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm<any>();
  const { data: meta } = useQuery({
    queryKey: ["task-meta"],
    queryFn: () => apiGet<Meta>("/api/tasks/meta"),
    enabled: open,
  });

  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [labels, setLabels] = React.useState<string[]>([]);

  const create = useMutation({
    mutationFn: (values: any) =>
      apiSend("/api/tasks", "POST", {
        ...values,
        estimatedHours: values.estimatedHours ? Number(values.estimatedHours) : null,
        projectId: values.projectId || defaultProjectId || null,
        parentId: defaultParentId || null,
        assigneeIds: assignees,
        labelIds: labels,
      }),
    onSuccess: () => {
      toast.success("Task created");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      reset(); setAssignees([]); setLabels([]);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onClose={onClose} title={defaultParentId ? "New subtask" : "New task"} className="max-w-2xl">
      <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input {...register("title", { required: true })} placeholder="What needs to be done?" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea {...register("description")} placeholder="Add details…" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select {...register("priority")} defaultValue="MEDIUM">
              {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Deadline</Label>
            <Input type="date" {...register("deadline")} />
          </div>
          <div className="space-y-1.5">
            <Label>Est. hours</Label>
            <Input type="number" step="0.5" {...register("estimatedHours")} />
          </div>
        </div>
        {!defaultProjectId && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select {...register("projectId")} defaultValue="">
                <option value="">None</option>
                {meta?.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select {...register("departmentId")} defaultValue="">
                <option value="">None</option>
                {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
          </div>
        )}

        {/* assignees */}
        <div className="space-y-1.5">
          <Label>Assignees</Label>
          <div className="flex flex-wrap gap-1.5">
            {meta?.assignable.map((u) => {
              const active = assignees.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setAssignees((a) => active ? a.filter((x) => x !== u.id) : [...a, u.id])}
                  className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
                    active ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                  }`}
                >
                  <Avatar firstName={u.firstName} lastName={u.lastName} src={u.avatarUrl} size={20} />
                  {u.firstName} {active && <Check className="size-3" />}
                </button>
              );
            })}
            {meta && meta.assignable.length === 0 && (
              <span className="text-xs text-muted-foreground">Your role can&apos;t assign tasks to others.</span>
            )}
          </div>
        </div>

        {/* labels */}
        {meta && meta.labels.length > 0 && (
          <div className="space-y-1.5">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-1.5">
              {meta.labels.map((l) => {
                const active = labels.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLabels((a) => active ? a.filter((x) => x !== l.id) : [...a, l.id])}
                    className="transition-transform hover:scale-105"
                    style={{ opacity: active ? 1 : 0.5 }}
                  >
                    <Badge color={l.color}>{active && <Check className="size-3" />} {l.name}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create task
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
