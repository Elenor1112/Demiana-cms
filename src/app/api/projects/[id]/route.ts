import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const project = await db.project.findUnique({
      where: { id },
      include: {
        client: true,
        lead: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } } },
        tasks: {
          where: { parentId: null },
          select: { id: true, status: true, progress: true, deadline: true, priority: true },
        },
      },
    });
    if (!project) throw new ApiError(404, "Project not found");

    const active = project.tasks.filter((t) => t.status !== "CANCELLED");
    const progress = active.length
      ? Math.round(active.reduce((s, t) => s + (t.status === "DONE" ? 100 : t.progress), 0) / active.length)
      : 0;
    const statusCounts = project.tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1; return acc;
    }, {} as Record<string, number>);

    const { tasks, ...rest } = project;
    return NextResponse.json({ project: { ...rest, progress, statusCounts, taskCount: project.tasks.length } });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  clientId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("Project.Edit");
    const { id } = await params;
    const data = schema.parse(await req.json());

    await db.project.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        status: data.status,
        clientId: data.clientId === undefined ? undefined : data.clientId || null,
        leadId: data.leadId === undefined ? undefined : data.leadId || null,
        deadline: data.deadline ? new Date(data.deadline) : data.deadline === null ? null : undefined,
      },
    });

    if (data.memberIds) {
      await db.projectMember.deleteMany({ where: { projectId: id } });
      await db.projectMember.createMany({ data: data.memberIds.map((userId) => ({ projectId: id, userId })) });
    }

    await audit({ actorId: user.id, action: "project.update", entity: "project", entityId: id });
    const fresh = await db.project.findUnique({ where: { id } });
    return NextResponse.json({ project: fresh });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Delete a project.
 *
 * A project holding tasks is cancelled rather than destroyed: the task rows
 * reference it without onDelete:Cascade, so a hard delete would be rejected by
 * the database, and the work history is worth keeping either way.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("Project.Delete");
    const { id } = await params;

    const project = await db.project.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, _count: { select: { tasks: true } } },
    });
    if (!project) throw new ApiError(404, "Project not found");

    if (project._count.tasks > 0) {
      const updated = await db.project.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await audit({
        actorId: user.id, action: "project.cancel", entity: "project", entityId: id,
        oldValue: { status: project.status }, newValue: { status: updated.status, taskCount: project._count.tasks },
      });
      return NextResponse.json({
        ok: true, archived: true, project: updated,
        message: `Project cancelled — it still has ${project._count.tasks} task(s).`,
      });
    }

    await db.projectMember.deleteMany({ where: { projectId: id } });
    await db.project.delete({ where: { id } });
    await audit({
      actorId: user.id, action: "project.delete", entity: "project", entityId: id,
      oldValue: { name: project.name },
    });
    return NextResponse.json({ ok: true, archived: false });
  } catch (e) {
    return toErrorResponse(e);
  }
}
