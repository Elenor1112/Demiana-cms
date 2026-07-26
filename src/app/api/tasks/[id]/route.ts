import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { logActivity, rollupSubtaskProgress, statusDefaultProgress } from "@/lib/tasks";
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
    await requireUser();
    const { id } = await params;
    const task = await db.task.findUnique({ where: { id }, include: taskInclude });
    if (!task) throw new ApiError(404, "Task not found");
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

    // progress auto-set on status change unless explicitly provided
    let progress = data.progress;
    if (data.status && data.status !== before.status && progress === undefined) {
      progress = statusDefaultProgress(data.status, before.progress);
    }

    await db.task.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        progress,
        deadline: data.deadline ? new Date(data.deadline) : data.deadline === null ? null : undefined,
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
      if (added.length) {
        await notifyMany(added.filter((uid) => uid !== user.id), {
          type: "TASK_ASSIGNED",
          title: `Assigned: ${before.title}`,
          body: `${user.firstName} assigned you ${before.code}`,
          link: `/tasks?task=${id}`,
        });
      }
    }

    if (data.labelIds) {
      await db.taskLabel.deleteMany({ where: { taskId: id } });
      await db.taskLabel.createMany({ data: data.labelIds.map((labelId) => ({ taskId: id, labelId })) });
    }

    // activity log for deadline changes
    if (data.deadline !== undefined) {
      const nextDeadline = data.deadline ? new Date(data.deadline) : null;
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
            body: `${user.firstName} moved ${before.code} to ${nextDeadline ? nextDeadline.toDateString() : "no deadline"}`,
            link: `/tasks?task=${id}`,
          });
        }
      }
    }

    // activity log for status/progress
    if (data.status && data.status !== before.status) {
      await logActivity({ actorId: user.id, taskId: id, verb: "changed status", meta: { from: before.status, to: data.status } });
      // notify followers/creator when a task enters approval or is done
      if (data.status === "WAITING_APPROVAL") {
        await notifyMany([before.createdById], {
          type: "APPROVAL_REQUIRED",
          title: `Approval needed: ${before.title}`,
          body: `${before.code} is waiting for your review`,
          link: `/tasks?task=${id}`,
        });
      }
      await rollupSubtaskProgress(id);
    }
    if (progress !== undefined && progress !== before.progress) {
      await rollupSubtaskProgress(id);
    }

    await audit({
      actorId: user.id, action: "task.update", entity: "task", entityId: id,
      oldValue: { status: before.status, progress: before.progress },
      newValue: { status: data.status ?? before.status, progress: progress ?? before.progress },
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
