import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse } from "@/lib/api";
import { nextTaskCode, logActivity, taskVisibilityFilter } from "@/lib/tasks";
import { notifyMany } from "@/lib/notify";
import type { Prisma, TaskStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const status = sp.getAll("status");
    const group = sp.get("group"); // open | closed
    const assignedTo = sp.get("assignedTo");
    const department = sp.get("department");
    const project = sp.get("project");
    const client = sp.get("client");
    const priority = sp.get("priority");
    const createdBy = sp.get("createdBy");
    const mine = sp.get("mine");

    const openStatuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "HOLD", "WAITING_APPROVAL"];
    const closedStatuses: TaskStatus[] = ["DONE", "CANCELLED"];

    // Scope to what this user is allowed to see before any other filter.
    const visibility = taskVisibilityFilter(user);

    const where: Prisma.TaskWhereInput = {
      ...(visibility ? { AND: [visibility] } : {}),
      parentId: sp.get("includeSubtasks") ? undefined : null,
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
      ...(status.length ? { status: { in: status as TaskStatus[] } } : {}),
      ...(group === "open" ? { status: { in: openStatuses } } : {}),
      ...(group === "closed" ? { status: { in: closedStatuses } } : {}),
      ...(department ? { departmentId: department } : {}),
      ...(project ? { projectId: project } : {}),
      ...(client ? { clientId: client } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(createdBy ? { createdById: createdBy } : {}),
      ...(assignedTo ? { assignees: { some: { userId: assignedTo } } } : {}),
      ...(mine ? { assignees: { some: { userId: user.id } } } : {}),
    };

    const tasks = await db.task.findMany({
      where,
      include: {
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        labels: { include: { label: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, company: true } },
        department: { select: { id: true, name: true, color: true } },
        _count: { select: { subtasks: true, comments: true } },
      },
      orderBy: [{ priority: "desc" }, { deadline: "asc" }],
    });

    return NextResponse.json({ tasks });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "HOLD", "WAITING_APPROVAL", "DONE", "CANCELLED"]).default("TODO"),
  projectId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
  assigneeIds: z.array(z.string()).default([]),
  labelIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("Task.Create");
    const data = createSchema.parse(await req.json());
    const code = await nextTaskCode();

    const task = await db.task.create({
      data: {
        code,
        title: data.title,
        description: data.description,
        priority: data.priority,
        status: data.status,
        projectId: data.projectId || null,
        clientId: data.clientId || null,
        departmentId: data.departmentId || null,
        parentId: data.parentId || null,
        deadline: data.deadline ? new Date(data.deadline) : null,
        estimatedHours: data.estimatedHours ?? null,
        createdById: user.id,
        assignees: { create: data.assigneeIds.map((userId) => ({ userId })) },
        labels: { create: data.labelIds.map((labelId) => ({ labelId })) },
      },
      include: { assignees: true },
    });

    await logActivity({ actorId: user.id, taskId: task.id, verb: "created" });
    await audit({ actorId: user.id, action: "task.create", entity: "task", entityId: task.id, newValue: { code, title: data.title } });

    if (data.assigneeIds.length) {
      await notifyMany(data.assigneeIds.filter((id) => id !== user.id), {
        type: "TASK_ASSIGNED",
        title: "New Task Assigned",
        body: `${user.firstName} ${user.lastName} assigned "${task.title}" to you.`,
        link: `/tasks?task=${task.id}`,
        meta: { taskId: task.id, assignedBy: `${user.firstName} ${user.lastName}` },
      });
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
