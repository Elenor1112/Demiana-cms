import "server-only";
import { db } from "./db";
import type { TaskStatus } from "@prisma/client";

/** Generate the next task code, e.g. ELN-143. */
export async function nextTaskCode(): Promise<string> {
  const last = await db.task.findFirst({
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });
  const lastNum = last?.code?.match(/(\d+)$/)?.[1];
  const next = lastNum ? parseInt(lastNum, 10) + 1 : 101;
  return `ELN-${next}`;
}

/** Recompute a project's completion % from its (non-cancelled) tasks. */
export async function recomputeProjectProgress(projectId: string) {
  const tasks = await db.task.findMany({
    where: { projectId, status: { not: "CANCELLED" }, parentId: null },
    select: { progress: true },
  });
  if (!tasks.length) return;
  // progress is derived; we don't store it on Project, but this hook is where
  // any cached rollup would update. Kept for future budget/health metrics.
}

/** When a subtask changes, roll progress up to its parent (average of subtasks). */
export async function rollupSubtaskProgress(taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { parentId: true },
  });
  if (!task?.parentId) return;
  const subs = await db.task.findMany({
    where: { parentId: task.parentId, status: { not: "CANCELLED" } },
    select: { progress: true, status: true },
  });
  if (!subs.length) return;
  const avg = Math.round(subs.reduce((s, t) => s + t.progress, 0) / subs.length);
  const allDone = subs.every((t) => t.status === "DONE");
  await db.task.update({
    where: { id: task.parentId },
    data: { progress: avg, ...(allDone ? { status: "DONE" } : {}) },
  });
}

/** Log an activity entry against a task. */
export async function logActivity(opts: {
  actorId: string;
  taskId: string;
  verb: string;
  meta?: Record<string, unknown>;
}) {
  await db.activity.create({
    data: {
      actorId: opts.actorId,
      taskId: opts.taskId,
      entity: "task",
      entityId: opts.taskId,
      verb: opts.verb,
      meta: opts.meta as object | undefined,
    },
  });
}

/** Progress presets when status changes (unless explicitly overridden). */
export function statusDefaultProgress(status: TaskStatus, current: number): number {
  switch (status) {
    case "DONE":
      return 100;
    case "TODO":
      return current > 0 ? current : 0;
    case "IN_PROGRESS":
      return current === 0 ? 10 : current;
    default:
      return current;
  }
}
