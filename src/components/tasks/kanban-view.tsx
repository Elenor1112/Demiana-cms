"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { apiSend } from "@/lib/fetcher";
import { TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { TaskCard, type TaskListItem } from "./task-bits";
import type { TaskStatus } from "@prisma/client";

export function KanbanView({
  tasks,
  onOpen,
  queryKey,
}: {
  tasks: TaskListItem[];
  onOpen: (id: string) => void;
  queryKey: unknown[];
}) {
  const qc = useQueryClient();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<TaskStatus | null>(null);

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      apiSend(`/api/tasks/${id}`, "PATCH", { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ tasks: TaskListItem[] }>(queryKey);
      qc.setQueryData<{ tasks: TaskListItem[] }>(queryKey, (old) =>
        old ? { tasks: old.tasks.map((t) => (t.id === id ? { ...t, status } : t)) } : old
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Couldn't move task");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  function onDrop(status: TaskStatus) {
    if (dragId) {
      const task = tasks.find((t) => t.id === dragId);
      if (task && task.status !== status) move.mutate({ id: dragId, status });
    }
    setDragId(null);
    setOverCol(null);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {TASK_STATUS_ORDER.map((status) => {
        const meta = TASK_STATUS_META[status];
        const colTasks = tasks.filter((t) => t.status === status);
        return (
          <div
            key={status}
            onDragOver={(e) => { e.preventDefault(); setOverCol(status); }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => onDrop(status)}
            className={`flex w-72 shrink-0 flex-col rounded-xl border transition-colors ${
              overCol === status ? "border-primary bg-primary/5" : "border-border bg-secondary/30"
            }`}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                <span className="text-sm font-semibold">{meta.label}</span>
                <span className="rounded-full bg-background px-1.5 text-xs text-muted-foreground">{colTasks.length}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2" style={{ minHeight: 120 }}>
              {colTasks.map((task) => (
                <motion.div
                  key={task.id}
                  layout
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => setDragId(null)}
                  className={dragId === task.id ? "opacity-40" : ""}
                >
                  <TaskCard task={task} onClick={() => onOpen(task.id)} />
                </motion.div>
              ))}
              {colTasks.length === 0 && (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                  Drop here
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
