"use client";
import { Flag, MessageSquare, GitBranch, Paperclip, CalendarClock, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AvatarGroup } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { TASK_STATUS_META, PRIORITY_META } from "@/lib/constants";
import { formatDate, formatDateTime, formatTimeOnly, cn } from "@/lib/utils";
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

/**
 * A read-only lifecycle timestamp: 📅 Jul 27, 2026  🕒 10:42 AM.
 *
 * The clock half is dropped when the value carries no time of day (local
 * midnight), matching how deadlines render elsewhere — see formatDateTime.
 * Wraps to two lines on narrow panels rather than overflowing.
 */
export function TimestampValue({
  value,
  placeholder = "—",
}: {
  value?: string | Date | null;
  placeholder?: string;
}) {
  if (!value) {
    return <span className="text-sm text-muted-foreground">{placeholder}</span>;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className="text-sm text-muted-foreground">{placeholder}</span>;
  }
  const time = formatTimeOnly(date);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
      <span className="inline-flex items-center gap-1.5">
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
        {formatDate(date)}
      </span>
      {time && (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          {time}
        </span>
      )}
    </span>
  );
}

/**
 * What to label a task with in lists, cards and the detail header.
 *
 * The client's company name is far more useful at a glance than an opaque
 * ELN-### code, so it wins when the task has a client. Internal tasks have no
 * client, so they keep the code rather than showing nothing.
 *
 * Display only — `code` remains the stable unique identifier in the database
 * and in notification/audit text, where a client name would be ambiguous
 * across that client's other tasks.
 */
export function taskRef(task: { code: string; client?: { company: string } | null }) {
  return task.client?.company?.trim() || task.code;
}

/** True when taskRef fell back to the code, so callers can pick a mono font. */
export function isCodeRef(task: { code: string; client?: { company: string } | null }) {
  return !task.client?.company?.trim();
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
      {/* gap + min-w-0 so a long company name truncates instead of pushing the
          priority flag out of the card. */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "min-w-0 truncate text-[11px] text-muted-foreground",
            // Mono suits an ID; a company name reads better in the body face.
            isCodeRef(task) ? "font-mono" : "font-medium"
          )}
          title={taskRef(task)}
        >
          {taskRef(task)}
        </span>
        <span className="shrink-0">
          <PriorityFlag priority={task.priority} />
        </span>
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
