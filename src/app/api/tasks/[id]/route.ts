import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import {
  logActivity, rollupSubtaskProgress, statusDefaultProgress, canViewTask,
  parseDeadline, formatDeadlineText, lifecycleStamps,
} from "@/lib/tasks";
import { can } from "@/lib/rbac";
import { notifyMany } from "@/lib/notify";
import type { TaskStatus } from "@prisma/client";

const taskInclude = {
  assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } } },
  followers: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
  labels: { include: { label: true } },
  project: { select: { id: true, name: true } },
  client: { select: { id: true, company: true } },
  department: { select: { id: true, name: true, color: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
  parent: { select: { id: true, code: true, title: true } },
  subtasks: {
    include: { assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } } },
    orderBy: { createdAt: "asc" as const },
  },
  checklist: { orderBy: { order: "asc" as const } },
  comments: {
    include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  activities: {
    include: { actor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" as const },
    take: 30,
  },
  attachments: true,
  dependsOn: { include: { prerequisite: { select: { id: true, code: true, title: true, status: true } } } },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const task = await db.task.findUnique({ where: { id }, include: taskInclude });
    if (!task) throw new ApiError(404, "Task not found");
    // 404 rather than 403 so an unrelated task's existence is not disclosed.
    if (!(await canViewTask(user, id))) throw new ApiError(404, "Task not found");
    return NextResponse.json({ task });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["TODO", "IN_PROGRESS", "HOLD", "WAITING_APPROVAL", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  deadline: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  actualHours: z.number().optional().nullable(),
  projectId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  assigneeIds: z.array(z.string()).optional(),
  labelIds: z.array(z.string()).optional(),
  approvalStatus: z.enum(["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const before = await db.task.findUnique({
      where: { id },
      include: { assignees: true },
    });
    if (!before) throw new ApiError(404, "Task not found");

    if (!(await canViewTask(user, id))) throw new ApiError(404, "Task not found");

    // Title, description, priority, deadline, assignment and project/department
    // placement are management decisions: CEO, Operations Manager, Account
    // Manager and Art Director only. Everyone else on a task may still move it
    // through statuses, log progress and work the checklist.
    const PRIVILEGED_FIELDS = [
      "title", "description", "priority", "deadline",
      "estimatedHours", "projectId", "departmentId", "assigneeIds", "labelIds",
    ] as const;
    const attempted = PRIVILEGED_FIELDS.filter((f) => data[f] !== undefined);
    if (attempted.length && !can(user, "Task.EditDetails")) {
      throw new ApiError(
        403,
        `You can update status, progress and the checklist, but not: ${attempted.join(", ")}.`
      );
    }

    // progress auto-set on status change unless explicitly provided
    let progress = data.progress;
    if (data.status && data.status !== before.status && progress === undefined) {
      progress = statusDefaultProgress(data.status, before.progress);
    }

    // Lifecycle stamps — server clock, write-once, never accepted from the client.
    // Computed before the write so the assignee reconcile below can't race it.
    const now = new Date();
    const willHaveAssignees = data.assigneeIds
      ? data.assigneeIds.length > 0
      : before.assignees.length > 0;
    const stamps = lifecycleStamps(
      { assignedAt: before.assignedAt, startedAt: before.startedAt, status: before.status },
      { status: data.status, hasAssignees: willHaveAssignees },
      now
    );

    await db.task.update({
      where: { id },
      data: {
        ...stamps,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        progress,
        deadline: data.deadline ? parseDeadline(data.deadline) : data.deadline === null ? null : undefined,
        estimatedHours: data.estimatedHours,
        actualHours: data.actualHours,
        projectId: data.projectId === undefined ? undefined : data.projectId || null,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        approvalStatus: data.approvalStatus,
      },
    });

    // reconcile assignees
    if (data.assigneeIds) {
      await db.taskAssignee.deleteMany({ where: { taskId: id } });
      await db.taskAssignee.createMany({ data: data.assigneeIds.map((userId) => ({ taskId: id, userId })) });
      const added = data.assigneeIds.filter((uid) => !before.assignees.some((a) => a.userId === uid));
      if (stamps.assignedAt) {
        // First time this task has had anyone on it.
        await logActivity({
          actorId: user.id,
          taskId: id,
          verb: "assigned",
          meta: { assignedAt: stamps.assignedAt, assigneeIds: data.assigneeIds },
        });
      } else if (added.length) {
        await logActivity({
          actorId: user.id,
          taskId: id,
          verb: "reassigned",
          meta: { assigneeIds: data.assigneeIds },
        });
      }
      if (added.length) {
        await notifyMany(added.filter((uid) => uid !== user.id), {
          type: "TASK_ASSIGNED",
          title: "New Task Assigned",
          body: `${user.firstName} ${user.lastName} assigned "${before.title}" to you.`,
          link: `/tasks?task=${id}`,
          meta: { taskId: id, assignedBy: `${user.firstName} ${user.lastName}` },
        });
      }
    }

    if (data.labelIds) {
      await db.taskLabel.deleteMany({ where: { taskId: id } });
      await db.taskLabel.createMany({ data: data.labelIds.map((labelId) => ({ taskId: id, labelId })) });
    }

    // activity log for deadline changes
    if (data.deadline !== undefined) {
      const nextDeadline = data.deadline ? parseDeadline(data.deadline) : null;
      if (nextDeadline?.getTime() !== before.deadline?.getTime()) {
        await logActivity({
          actorId: user.id,
          taskId: id,
          verb: "changed deadline",
          meta: { from: before.deadline, to: nextDeadline },
        });
        // let assignees know the date moved
        const others = before.assignees.map((a) => a.userId).filter((uid) => uid !== user.id);
        if (others.length) {
          await notifyMany(others, {
            type: "DEADLINE_REMINDER",
            title: `Deadline changed: ${before.title}`,
            body: `${user.firstName} moved ${before.code} to ${nextDeadline ? formatDeadlineText(nextDeadline) : "no deadline"}`,
            link: `/tasks?task=${id}`,
          });
        }
      }
    }

    // activity log for status/progress
    if (data.status && data.status !== before.status) {
      await logActivity({ actorId: user.id, taskId: id, verb: "changed status", meta: { from: before.status, to: data.status } });
      if (stamps.startedAt) {
        await logActivity({
          actorId: user.id,
          taskId: id,
          verb: "started work",
          meta: { startedAt: stamps.startedAt },
        });
      }
      // notify followers/creator when a task enters approval or is done
      if (data.status === "WAITING_APPROVAL") {
        await notifyMany([before.createdById], {
          type: "APPROVAL_REQUIRED",
          title: "Approval needed",
          body: `"${before.title}" (${before.code}) is waiting for your review.`,
          link: `/tasks?task=${id}`,
          meta: { taskId: id, assignedBy: `${user.firstName} ${user.lastName}` },
        });
      }
      await rollupSubtaskProgress(id);
    }
    if (progress !== undefined && progress !== before.progress) {
      await rollupSubtaskProgress(id);
    }

    await audit({
      actorId: user.id, action: "task.update", entity: "task", entityId: id,
      oldValue: { status: before.status, progress: before.progress, assignedAt: before.assignedAt, startedAt: before.startedAt },
      newValue: {
        status: data.status ?? before.status,
        progress: progress ?? before.progress,
        assignedAt: stamps.assignedAt ?? before.assignedAt,
        startedAt: stamps.startedAt ?? before.startedAt,
      },
    });

    const fresh = await db.task.findUnique({ where: { id }, include: taskInclude });
    return NextResponse.json({ task: fresh });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("Task.Delete");
    const { id } = await params;
    const task = await db.task.findUnique({ where: { id } });
    if (!task) throw new ApiError(404, "Task not found");
    await db.task.delete({ where: { id } });
    await audit({ actorId: user.id, action: "task.delete", entity: "task", entityId: id, oldValue: { code: task.code } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
