import "server-only";
import { db } from "./db";
import {
  can, canAssignTo, ASSIGNMENT_MATRIX, ASSIGNABLE_DEPARTMENTS, type SessionUser,
} from "./rbac";
import { requireUserDateTime, isDateOnly, zonedParts, APP_TIMEZONE } from "./timezone";
// api.ts does not import this module, so there is no cycle.
import { ApiError } from "./api";
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
    // The delegated executor sees the task even though they are not an assignee
    // — this is what puts it on their dashboard and in "my tasks".
    { workerId: user.id },
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
 * Accepts "2026-08-15" (date only) and "2026-08-15T14:30" from the picker.
 * Both are wall-clock strings with no zone, so they are resolved against
 * APP_TIMEZONE — NOT the server's local zone. Using the server's zone meant a
 * Cairo user's "1:30 PM" became 13:30 UTC on Vercel (which runs UTC) and read
 * back as 4:30 PM; the same code on a Cairo laptop stored it correctly, which
 * is why the bug only ever appeared in production.
 *
 * Throws on unparseable input rather than silently storing an Invalid Date.
 */
export function parseDeadline(input: string): Date {
  return requireUserDateTime(input, "deadline");
}

/**
 * The instant a deadline actually lapses.
 *
 * A date-only deadline (local midnight) means "due by end of that day", so it
 * should not read as overdue at 00:01 on the day itself.
 */
export function deadlineDueBy(deadline: Date): Date {
  // Midnight *in the company's zone*, not the server's — on a UTC server
  // getHours() would report a different hour and misclassify date-only
  // deadlines, making them overdue at the wrong moment.
  if (!isDateOnly(deadline)) return deadline;
  return new Date(deadline.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Human-readable deadline for notification text; includes time when set.
 *
 * Rendered in APP_TIMEZONE: this text is generated server-side and emailed /
 * pushed, so it must read as the company's wall clock rather than the server's.
 */
export function formatDeadlineText(d: Date) {
  const p = zonedParts(d);
  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(d);
  if (p.hour === 0 && p.minute === 0) return datePart;
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
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

/**
 * Resolve the client a task belongs to.
 *
 * The hierarchy is Client → Project → Task, so a task's client is ALWAYS its
 * project's client — never independently chosen. `requestedClientId` is only
 * honoured for tasks with no project (ad-hoc internal work), which is why the
 * API can keep accepting the old `clientId` field without it ever creating a
 * mismatch.
 *
 * The database enforces the same rule via the task_sync_client trigger; this
 * function exists so the API returns a correct value immediately and can report
 * a bad projectId as a clean 400 instead of a constraint error.
 */
export async function resolveTaskClientId(
  projectId: string | null | undefined,
  requestedClientId: string | null | undefined
): Promise<string | null> {
  if (!projectId) return requestedClientId || null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!project) throw new ApiError(400, "The selected project does not exist.");
  return project.clientId;
}

/**
 * The status that means "work has actually begun".
 *
 * Single place to change if the workflow ever gains a different active state —
 * every lifecycle stamp derives from this rather than hard-coding IN_PROGRESS.
 */
export const WORK_STARTED_STATUS: TaskStatus = "IN_PROGRESS";

/**
 * Lifecycle timestamps to apply on a task update, given what the task looks like
 * now and what is changing.
 *
 * Both fields are write-once by design:
 *  - `assignedAt` is stamped the first time the task has at least one assignee,
 *    so a task created unassigned gets its stamp when it is first handed out.
 *    Reassignment later leaves the original in place.
 *  - `startedAt` is stamped on the first transition into IN_PROGRESS and is
 *    never cleared — bouncing back to TODO/HOLD keeps the original.
 *
 * Returns a partial `data` object (empty when nothing should change), so callers
 * can spread it into a single `task.update` rather than issuing extra writes.
 * `now` is passed in so one request stamps a consistent instant across fields.
 */
export function lifecycleStamps(
  current: { assignedAt: Date | null; startedAt: Date | null; status: TaskStatus },
  next: { status?: TaskStatus; hasAssignees?: boolean },
  now: Date = new Date()
): { assignedAt?: Date; startedAt?: Date } {
  const stamps: { assignedAt?: Date; startedAt?: Date } = {};

  if (!current.assignedAt && next.hasAssignees) stamps.assignedAt = now;

  const enteringWork = next.status === WORK_STARTED_STATUS && current.status !== WORK_STARTED_STATUS;
  if (!current.startedAt && enteringWork) stamps.startedAt = now;

  return stamps;
}

/**
 * Who this user may pick as the worker on this task, and whether they may set
 * one at all.
 *
 * Three ways to qualify, checked in order:
 *  - `Task.AssignWorker` / `Task.ChangeWorker` — the general grant. Super admins
 *    and Account Management hold it and may pick anyone their role matrix allows.
 *  - `Task.DelegateOwnTasks` — the Art Director case. Only on tasks they are
 *    themselves assigned to, and only over people in their own department.
 *  - otherwise, no.
 *
 * `settingFirstWorker` distinguishes AssignWorker from ChangeWorker so the two
 * can be granted independently.
 */
export function workerAuthorization(
  user: SessionUser,
  task: { workerId: string | null; assignees: { userId: string }[] },
  opts: { settingFirstWorker: boolean }
): { allowed: boolean; reason?: string; candidates: Prisma.UserWhereInput } {
  const permission = opts.settingFirstWorker ? "Task.AssignWorker" : "Task.ChangeWorker";
  const hasGeneralGrant = can(user, permission);
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  const canDelegateOwn = can(user, "Task.DelegateOwnTasks") && isAssignee;

  if (!hasGeneralGrant && !canDelegateOwn) {
    return {
      allowed: false,
      reason: can(user, "Task.DelegateOwnTasks")
        ? "You can only delegate tasks you are assigned to."
        : `Missing permission: ${permission}`,
      candidates: {},
    };
  }

  // Super admins pick from anyone active.
  if (user.isSuperAdmin) return { allowed: true, candidates: { status: "ACTIVE" } };

  // Who this role may put on work at all — the same matrix + department rule
  // used for assignees, so there is one definition rather than two.
  const roles = ASSIGNMENT_MATRIX[user.roleKey] ?? [];
  const departments = ASSIGNABLE_DEPARTMENTS[user.roleKey] ?? [];
  const generalScope: Prisma.UserWhereInput = {
    status: "ACTIVE",
    OR: [
      { role: { key: { in: roles } } },
      ...(departments.length ? [{ department: { name: { in: departments } } }] : []),
    ],
  };

  // Delegating a task you are assigned to is additionally capped at your own
  // team — the "only members of the Art Director's team appear" requirement.
  // Applied whenever the user is delegating their own task, even if they also
  // hold the general grant, so the narrower rule is never silently bypassed.
  if (canDelegateOwn) {
    if (!user.departmentId) {
      return { allowed: false, reason: "You are not assigned to a department.", candidates: {} };
    }
    return {
      allowed: true,
      candidates: { status: "ACTIVE", departmentId: user.departmentId },
    };
  }

  return { allowed: true, candidates: generalScope };
}

/**
 * Whether `user` may put `candidate` on a task, honouring both the role matrix
 * and the department carve-out. Shared by assignee and worker validation.
 */
export async function isAssignableBy(user: SessionUser, candidateId: string) {
  if (user.isSuperAdmin) return true;
  const candidate = await db.user.findUnique({
    where: { id: candidateId },
    select: { status: true, role: { select: { key: true } }, department: { select: { name: true } } },
  });
  if (!candidate || candidate.status !== "ACTIVE") return false;
  return canAssignTo(user.roleKey, candidate.role.key, candidate.department?.name ?? null);
}

/**
 * Record a worker change in the append-only history and move the pointer.
 *
 * Closes the currently-open history row before opening the new one, so the
 * timeline never has two active workers and "how long did this person hold it"
 * is answerable directly.
 */
export async function recordWorkerChange(opts: {
  taskId: string;
  workerId: string | null;
  actorId: string;
  at?: Date;
}) {
  const at = opts.at ?? new Date();
  await db.workerAssignment.updateMany({
    where: { taskId: opts.taskId, unassignedAt: null },
    data: { unassignedAt: at },
  });
  await db.workerAssignment.create({
    data: {
      taskId: opts.taskId,
      workerId: opts.workerId,
      assignedById: opts.actorId,
      assignedAt: at,
    },
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
