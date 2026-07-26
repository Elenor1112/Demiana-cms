"use client";
import { Flag, MessageSquare, GitBranch, Paperclip, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AvatarGroup } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { TASK_STATUS_META, PRIORITY_META } from "@/lib/constants";
import { formatDateTime, cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@prisma/client";

export function StatusBadge({ status }: { status: TaskStatus }) {
  const m = TASK_STATUS_META[status];
  return <Badge color={m.color} bg={m.bg}>{m.label}</Badge>;
}

export function StatusDot({ status }: { status: TaskStatus }) {
  const m = TASK_STATUS_META[status];
  return <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: m.color }} />;
}

export function PriorityFlag({ priority, withLabel }: { priority: TaskPriority; withLabel?: boolean }) {
  const m = PRIORITY_META[priority];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: m.color }}>
      <Flag className="size-3" />
      {withLabel && m.label}
    </span>
  );
}

export function DeadlinePill({ deadline, status }: { deadline?: string | Date | null; status: TaskStatus }) {
  if (!deadline) return null;
  const date = new Date(deadline);
  // A date-only deadline (local midnight) means end of that day, so it should
  // not read as overdue from 00:01 onwards.
  const dueBy =
    date.getHours() === 0 && date.getMinutes() === 0
      ? new Date(new Date(date).setHours(23, 59, 59, 999))
      : date;
  const overdue = dueBy < new Date() && status !== "DONE" && status !== "CANCELLED";
  const soon = !overdue && dueBy.getTime() - Date.now() < 2 * 864e5 && status !== "DONE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        overdue ? "text-destructive font-medium" : soon ? "text-warning" : "text-muted-foreground"
      )}
    >
      <CalendarClock className="size-3" />
      {formatDateTime(date)}
    </span>
  );
}

export type TaskListItem = {
  id: string;
  code: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  progress: number;
  deadline?: string | null;
  assignees: { user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } }[];
  labels: { label: { id: string; name: string; color: string } }[];
  project?: { id: string; name: string } | null;
  client?: { id: string; company: string } | null;
  department?: { id: string; name: string; color: string } | null;
  _count: { subtasks: number; comments: number };
};

export function TaskCard({ task, onClick }: { task: TaskListItem; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">{task.code}</span>
        <PriorityFlag priority={task.priority} />
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{task.title}</p>

      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((l) => (
            <Badge key={l.label.id} color={l.label.color} className="text-[10px]">{l.label.name}</Badge>
          ))}
        </div>
      )}

      {task.progress > 0 && task.progress < 100 && (
        <Progress value={task.progress} className="mt-2.5 h-1.5" />
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          {task._count.subtasks > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]"><GitBranch className="size-3" /> {task._count.subtasks}</span>
          )}
          {task._count.comments > 0 && (
            <span className="flex items-center gap-0.5 text-[11px]"><MessageSquare className="size-3" /> {task._count.comments}</span>
          )}
          <DeadlinePill deadline={task.deadline} status={task.status} />
        </div>
        <AvatarGroup users={task.assignees.map((a) => a.user)} size={24} max={3} />
      </div>
    </div>
  );
}
