"use client";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { StatusDot, PriorityFlag, DeadlinePill, taskRef, isCodeRef, type TaskListItem } from "./task-bits";
import { cn } from "@/lib/utils";
import { AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function ListView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-5">
      {TASK_STATUS_ORDER.map((status) => {
        const group = tasks.filter((t) => t.status === status);
        if (!group.length) return null;
        const meta = TASK_STATUS_META[status];
        return (
          <div key={status}>
            <div className="mb-2 flex items-center gap-2">
              <StatusDot status={status} />
              <span className="text-sm font-semibold">{meta.label}</span>
              <span className="text-xs text-muted-foreground">{group.length}</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              {group.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onOpen(task.id)}
                  className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-accent/40"
                >
                  {/* Widened from w-16 (sized for "ELN-105") to fit a company
                      name, and truncating so long ones don't crowd the title. */}
                  <span
                    className={cn(
                      "w-28 shrink-0 truncate text-[11px] text-muted-foreground",
                      isCodeRef(task) ? "font-mono" : "font-medium"
                    )}
                    title={taskRef(task)}
                  >
                    {taskRef(task)}
                  </span>
                  <PriorityFlag priority={task.priority} />
                  <span className="flex-1 truncate text-sm font-medium">{task.title}</span>
                  {task.labels.slice(0, 2).map((l) => (
                    <Badge key={l.label.id} color={l.label.color} className="hidden text-[10px] sm:inline-flex">{l.label.name}</Badge>
                  ))}
                  {task.progress > 0 && task.progress < 100 && (
                    <Progress value={task.progress} className="hidden h-1.5 w-20 md:block" />
                  )}
                  <DeadlinePill deadline={task.deadline} status={task.status} />
                  <AvatarGroup users={task.assignees.map((a) => a.user)} size={24} max={3} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
