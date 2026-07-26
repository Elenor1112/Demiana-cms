import "server-only";
import { db } from "./db";
import { can, type SessionUser } from "./rbac";
import type { Prisma, TaskStatus } from "@prisma/client";

/**
 * Rows a user is allowed to see.
 *
 * Task.ViewAll (CEO, Operations Manager, Account Manager) sees everything.
 * Everyone else sees only tasks they are involved in — assigned to, following,
 * or that they created. Creator is included so a lead who assigns work out
 * (e.g. an Art Director briefing a designer) does not lose sight of it.
 *
 * Returns undefined when no filter is needed, so callers can spread it.
 */
export function taskVisibilityFilter(user: SessionUser): Prisma.TaskWhereInput | undefined {
  if (can(user, "Task.ViewAll")) return undefined;

  const OR: Prisma.TaskWhereInput[] = [
    { assignees: { some: { userId: user.id } } },
    { followers: { some: { userId: user.id } } },
    { createdById: user.id },
    // Keep a parent visible when the user only owns one of its subtasks.
    { subtasks: { some: { assignees: { some: { userId: user.id } } } } },
  ];

  // Department leads (Art Director) additionally see their own unit's work, so
  // they can set priorities and deadlines on their team's tasks.
  if (can(user, "Task.ViewDepartment") && user.departmentId) {
    OR.push({ departmentId: user.departmentId });
  }

  return { OR };
}

/** Whether this user may see this specific task. */
export async function canViewTask(user: SessionUser, taskId: string) {
  if (can(user, "Task.ViewAll")) return true;
  const found = await db.task.findFirst({
    where: { id: taskId, ...taskVisibilityFilter(user) },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Parse a deadline coming from the client.
 *
 * Accepts "2026-08-15" (date only) and "2026-08-15T14:30" from a
 * datetime-local input. JS parses a bare date string as UTC midnight, which in
 * a non-UTC zone lands on a different hour of the intended day; the date-only
 * branch pins it to *local* midnight instead, which the UI then renders as
 * date-only (no misleading "3:00 AM").
 */
export function parseDeadline(input: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }
  return new Date(input);
}

/**
 * The instant a deadline actually lapses.
 *
 * A date-only deadline (local midnight) means "due by end of that day", so it
 * should not read as overdue at 00:01 on the day itself.
 */
export function deadlineDueBy(deadline: Date): Date {
  if (deadline.getHours() === 0 && deadline.getMinutes() === 0) {
    const d = new Date(deadline);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  return deadline;
}

/** Human-readable deadline for notification text; includes time when set. */
export function formatDeadlineText(d: Date) {
  const datePart = d.toDateString();
  if (d.getHours() === 0 && d.getMinutes() === 0) return datePart;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${datePart} ${hh}:${mm}`;
}

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
