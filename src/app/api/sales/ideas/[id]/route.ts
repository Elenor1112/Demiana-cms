import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { requireFutureDateTime } from "@/lib/timezone";
import { nextTaskCode, logActivity } from "@/lib/tasks";
import { requireSalesModule } from "@/lib/sales";
import { ideaPatchSchema, ideaConvertSchema } from "@/lib/sales-schemas";
import { notifyMany } from "@/lib/notify";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

async function loadIdea(id: string) {
  const idea = await db.salesIdea.findUnique({
    where: { id },
    include: {
      owner: userPick,
      createdBy: userPick,
      lead: { select: { id: true, code: true, companyName: true, convertedClientId: true } },
      client: { select: { id: true, company: true } },
    },
  });
  if (!idea) throw new ApiError(404, "Idea not found.");
  return idea;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    if (!can(user, "Sales.IdeaManage")) {
      throw new ApiError(403, "Missing permission: Sales.IdeaManage");
    }
    const { id } = await params;
    const idea = await loadIdea(id);

    const body = ideaPatchSchema.parse(await req.json());
    const data: Prisma.SalesIdeaUpdateInput = {};
    for (const key of ["title", "description", "category", "priority", "estimatedImpact", "status"] as const) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[key] = body[key];
    }
    if (body.ownerId !== undefined) {
      data.owner = body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true };
    }
    if (body.leadId !== undefined) {
      data.lead = body.leadId ? { connect: { id: body.leadId } } : { disconnect: true };
    }
    if (body.clientId !== undefined) {
      data.client = body.clientId ? { connect: { id: body.clientId } } : { disconnect: true };
    }

    const updated = await db.salesIdea.update({
      where: { id },
      data,
      include: {
        owner: userPick,
        createdBy: userPick,
        lead: { select: { id: true, code: true, companyName: true } },
        client: { select: { id: true, company: true } },
      },
    });

    await audit({
      actorId: user.id, action: "sales.idea.update", entity: "salesIdea", entityId: id,
      oldValue: { status: idea.status, ownerId: idea.ownerId },
      newValue: { status: updated.status, ownerId: updated.ownerId },
    });

    return NextResponse.json({ idea: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Convert an idea into a Task or a Project.
 *
 * Reuses the existing task/project creation rules rather than reimplementing
 * them: task codes come from nextTaskCode, and the activity entry goes through
 * logActivity, so a converted task is indistinguishable from a hand-made one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    if (!can(user, "Sales.IdeaManage")) {
      throw new ApiError(403, "Missing permission: Sales.IdeaManage");
    }
    const { id } = await params;
    const idea = await loadIdea(id);

    if (idea.convertedAt) {
      throw new ApiError(409, "This idea has already been converted.");
    }

    const body = ideaConvertSchema.parse(await req.json());
    const now = new Date();

    // The client an idea belongs to: explicit, else its own client, else the
    // client its lead became once the deal closed.
    const clientId = body.clientId || idea.clientId || idea.lead?.convertedClientId || null;

    if (body.target === "project") {
      if (!can(user, "Project.Create")) {
        throw new ApiError(403, "Missing permission: Project.Create");
      }
      if (!clientId) {
        throw new ApiError(
          400,
          "A project needs a client. Link this idea to a client, or convert it to a task instead."
        );
      }
      const project = await db.project.create({
        data: {
          name: idea.title,
          description: idea.description,
          status: "PLANNING",
          clientId,
          leadId: idea.ownerId,
          deadline: body.deadline ? requireFutureDateTime(body.deadline, "deadline") : null,
        },
      });
      await db.salesIdea.update({
        where: { id },
        data: { convertedProjectId: project.id, convertedAt: now, status: "IMPLEMENTED" },
      });
      await audit({
        actorId: user.id, action: "sales.idea.convert", entity: "salesIdea", entityId: id,
        newValue: { target: "project", projectId: project.id },
      });
      await audit({
        actorId: user.id, action: "project.create", entity: "project", entityId: project.id,
        newValue: { name: project.name, clientId, fromIdea: id },
      });
      return NextResponse.json({ project }, { status: 201 });
    }

    // Task branch.
    if (!can(user, "Task.Create")) {
      throw new ApiError(403, "Missing permission: Task.Create");
    }
    // Task.clientId is derived from the project when one is given — the DB
    // trigger enforces it either way, so this only affects the immediate reply.
    let taskClientId = clientId;
    if (body.projectId) {
      const project = await db.project.findUnique({
        where: { id: body.projectId },
        select: { clientId: true },
      });
      if (!project) throw new ApiError(400, "The selected project does not exist.");
      taskClientId = project.clientId;
    }

    const code = await nextTaskCode();
    const task = await db.task.create({
      data: {
        code,
        title: idea.title,
        description: idea.description,
        status: "TODO",
        priority: idea.priority,
        projectId: body.projectId || null,
        clientId: taskClientId,
        createdById: user.id,
        deadline: body.deadline ? requireFutureDateTime(body.deadline, "deadline") : null,
        assignedAt: body.assigneeIds.length ? now : null,
        assignees: { create: body.assigneeIds.map((userId) => ({ userId })) },
      },
    });

    await db.salesIdea.update({
      where: { id },
      data: { convertedTaskId: task.id, convertedAt: now, status: "IMPLEMENTED" },
    });

    await logActivity({ actorId: user.id, taskId: task.id, verb: "created" });
    await audit({
      actorId: user.id, action: "sales.idea.convert", entity: "salesIdea", entityId: id,
      newValue: { target: "task", taskId: task.id, code },
    });
    await audit({
      actorId: user.id, action: "task.create", entity: "task", entityId: task.id,
      newValue: { code, title: task.title, fromIdea: id },
    });

    const assignees = body.assigneeIds.filter((uid) => uid !== user.id);
    if (assignees.length) {
      await notifyMany(assignees, {
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    if (!can(user, "Sales.IdeaManage")) {
      throw new ApiError(403, "Missing permission: Sales.IdeaManage");
    }
    const { id } = await params;
    const idea = await loadIdea(id);

    await db.salesIdea.delete({ where: { id } });
    await audit({
      actorId: user.id, action: "sales.idea.delete", entity: "salesIdea", entityId: id,
      oldValue: { title: idea.title },
    });

    return NextResponse.json({ ok: true, message: "Idea deleted" });
  } catch (e) {
    return toErrorResponse(e);
  }
}
