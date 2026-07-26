"use client";
import { StatusBadge, PriorityFlag, type TaskListItem } from "./task-bits";
import { AvatarGroup } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { formatDateTime } from "@/lib/utils";

export function TableView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
          <tr>
            {["Code", "Task", "Status", "Priority", "Project", "Assignees", "Progress", "Deadline"].map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-2.5 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.map((task) => (
            <tr key={task.id} onClick={() => onOpen(task.id)} className="cursor-pointer hover:bg-accent/40">
              <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{task.code}</td>
              <td className="max-w-[280px] truncate px-4 py-2.5 font-medium">{task.title}</td>
              <td className="px-4 py-2.5"><StatusBadge status={task.status} /></td>
              <td className="px-4 py-2.5"><PriorityFlag priority={task.priority} withLabel /></td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{task.project?.name ?? "—"}</td>
              <td className="px-4 py-2.5"><AvatarGroup users={task.assignees.map((a) => a.user)} size={24} max={3} /></td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Progress value={task.progress} className="h-1.5 w-16" />
                  <span className="text-xs text-muted-foreground">{task.progress}%</span>
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(task.deadline)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
