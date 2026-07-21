"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  X, Plus, Trash2, Send, CheckCircle2, Circle, GitBranch,
  Clock, MessageSquare, Activity as ActivityIcon,
} from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "./task-bits";
import { TASK_STATUS_META, TASK_STATUS_ORDER, PRIORITY_META } from "@/lib/constants";
import { formatDate, relativeTime, fullName } from "@/lib/utils";
import { useSession, useCan } from "@/components/session-context";
import type { TaskStatus } from "@prisma/client";

export function TaskDetail({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {taskId && <Panel taskId={taskId} onClose={onClose} />}
    </AnimatePresence>,
    document.body
  );
}

function Panel({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useSession();
  const can = useCan();
  const listKeys = ["tasks"];

  const { data, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiGet<{ task: any }>(`/api/tasks/${taskId}`),
  });
  const task = data?.task;

  const patch = useMutation({
    mutationFn: (body: any) => apiSend(`/api/tasks/${taskId}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: listKeys });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [comment, setComment] = React.useState("");
  const addComment = useMutation({
    mutationFn: () => apiSend(`/api/tasks/${taskId}/comments`, "POST", { body: comment }),
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["task", taskId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newItem, setNewItem] = React.useState("");
  const addChecklist = useMutation({
    mutationFn: () => apiSend(`/api/tasks/${taskId}/checklist`, "POST", { text: newItem }),
    onSuccess: () => { setNewItem(""); qc.invalidateQueries({ queryKey: ["task", taskId] }); },
  });
  const toggleChecklist = useMutation({
    mutationFn: (v: { itemId: string; done: boolean }) => apiSend(`/api/tasks/${taskId}/checklist`, "PATCH", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}
      />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl"
      >
        {isLoading || !task ? (
          <div className="space-y-4 p-6"><Skeleton className="h-8 w-40" /><Skeleton className="h-32" /><Skeleton className="h-48" /></div>
        ) : (
          <>
            {/* header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{task.code}</span>
                <StatusBadge status={task.status} />
              </div>
              <div className="flex items-center gap-1">
                {can("Task.Delete") && (
                  <button
                    onClick={() => {
                      if (confirm("Delete this task?")) {
                        apiSend(`/api/tasks/${taskId}`, "DELETE").then(() => {
                          qc.invalidateQueries({ queryKey: listKeys }); onClose();
                        });
                      }
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
                <button onClick={onClose} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <input
                defaultValue={task.title}
                onBlur={(e) => e.target.value !== task.title && patch.mutate({ title: e.target.value })}
                className="w-full bg-transparent text-xl font-bold outline-none focus:bg-accent/30 rounded px-1 -mx-1"
              />

              {task.parent && (
                <a href={`/tasks?task=${task.parent.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <GitBranch className="size-3" /> Subtask of {task.parent.code}
                </a>
              )}

              {/* meta grid */}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-border bg-background p-4">
                <MetaRow label="Status">
                  <Select
                    value={task.status}
                    onChange={(e) => patch.mutate({ status: e.target.value as TaskStatus })}
                    className="h-8"
                  >
                    {TASK_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{TASK_STATUS_META[s].label}</option>
                    ))}
                  </Select>
                </MetaRow>
                <MetaRow label="Priority">
                  <Select value={task.priority} onChange={(e) => patch.mutate({ priority: e.target.value })} className="h-8">
                    {Object.entries(PRIORITY_META).map(([k, m]) => (
                      <option key={k} value={k}>{m.label}</option>
                    ))}
                  </Select>
                </MetaRow>
                <MetaRow label="Assignees">
                  {task.assignees.length ? (
                    <AvatarGroup users={task.assignees.map((a: any) => a.user)} size={26} />
                  ) : <span className="text-sm text-muted-foreground">Unassigned</span>}
                </MetaRow>
                <MetaRow label="Deadline">
                  <span className="text-sm">{formatDate(task.deadline)}</span>
                </MetaRow>
                <MetaRow label="Project">
                  <span className="text-sm">{task.project?.name ?? "—"}</span>
                </MetaRow>
                <MetaRow label="Client">
                  <span className="text-sm">{task.client?.company ?? "—"}</span>
                </MetaRow>
              </div>

              {/* progress */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium">Progress</span>
                  <span className="text-muted-foreground">{task.progress}%</span>
                </div>
                <input
                  type="range" min={0} max={100} step={5} defaultValue={task.progress}
                  onMouseUp={(e) => patch.mutate({ progress: Number((e.target as HTMLInputElement).value) })}
                  className="w-full accent-primary"
                />
              </div>

              {/* description */}
              <div className="mt-4">
                <div className="mb-1.5 text-sm font-medium">Description</div>
                <Textarea
                  defaultValue={task.description ?? ""}
                  placeholder="Add a description…"
                  onBlur={(e) => e.target.value !== (task.description ?? "") && patch.mutate({ description: e.target.value })}
                />
              </div>

              {/* checklist */}
              <Section icon={CheckCircle2} title={`Checklist (${task.checklist.filter((c: any) => c.done).length}/${task.checklist.length})`}>
                {task.checklist.length > 0 && (
                  <Progress
                    value={task.checklist.length ? (task.checklist.filter((c: any) => c.done).length / task.checklist.length) * 100 : 0}
                    className="mb-2 h-1.5"
                  />
                )}
                <div className="space-y-1">
                  {task.checklist.map((item: any) => (
                    <button
                      key={item.id}
                      onClick={() => toggleChecklist.mutate({ itemId: item.id, done: !item.done })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent/40"
                    >
                      {item.done ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                      <span className={item.done ? "text-muted-foreground line-through" : ""}>{item.text}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 flex gap-2">
                  <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add item…"
                    onKeyDown={(e) => e.key === "Enter" && newItem && addChecklist.mutate()} className="h-8" />
                  <Button size="sm" variant="outline" onClick={() => newItem && addChecklist.mutate()}><Plus className="size-4" /></Button>
                </div>
              </Section>

              {/* subtasks */}
              {task.subtasks.length > 0 && (
                <Section icon={GitBranch} title={`Subtasks (${task.subtasks.length})`}>
                  <div className="space-y-1">
                    {task.subtasks.map((st: any) => (
                      <a key={st.id} href={`/tasks?task=${st.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/40">
                        <span className="size-2 rounded-full" style={{ backgroundColor: TASK_STATUS_META[st.status as TaskStatus].color }} />
                        <span className="font-mono text-[11px] text-muted-foreground">{st.code}</span>
                        <span className="flex-1 truncate">{st.title}</span>
                        <AvatarGroup users={st.assignees.map((a: any) => a.user)} size={20} max={2} />
                      </a>
                    ))}
                  </div>
                </Section>
              )}

              {/* comments */}
              <Section icon={MessageSquare} title={`Comments (${task.comments.length})`}>
                <div className="space-y-3">
                  {task.comments.map((c: any) => (
                    <div key={c.id} className="flex gap-2.5">
                      <Avatar firstName={c.author.firstName} lastName={c.author.lastName} src={c.author.avatarUrl} size={30} />
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium">{fullName(c.author)}</span>
                          <span className="text-[11px] text-muted-foreground">{relativeTime(c.createdAt)}</span>
                        </div>
                        <p className="text-sm text-foreground/90">{c.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Avatar firstName={me.firstName} lastName={me.lastName} size={30} />
                  <div className="flex flex-1 gap-2">
                    <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…"
                      onKeyDown={(e) => e.key === "Enter" && comment && addComment.mutate()} />
                    <Button size="icon" onClick={() => comment && addComment.mutate()} disabled={addComment.isPending}>
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              </Section>

              {/* activity */}
              <Section icon={ActivityIcon} title="Activity">
                <div className="space-y-2">
                  {task.activities.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      <span className="font-medium text-foreground">{a.actor.firstName}</span>
                      {a.verb}
                      {a.meta?.to && <Badge color={TASK_STATUS_META[a.meta.to as TaskStatus]?.color}>{TASK_STATUS_META[a.meta.to as TaskStatus]?.label ?? a.meta.to}</Badge>}
                      <span className="ml-auto">{relativeTime(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.FC<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </div>
      {children}
    </div>
  );
}
