import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const department = await db.department.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        members: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
        _count: { select: { members: true, tasks: true } },
      },
    });
    if (!department) throw new ApiError(404, "Department not found");
    return NextResponse.json({ department });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  color: z.string().optional(),
  headId: z.string().optional().nullable(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Department.Edit");
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const before = await db.department.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Department not found");

    // A department head must actually belong to the department they lead.
    if (data.headId) {
      const head = await db.user.findUnique({
        where: { id: data.headId },
        select: { departmentId: true },
      });
      if (!head) throw new ApiError(400, "Selected head does not exist");
      if (head.departmentId && head.departmentId !== id) {
        throw new ApiError(400, "Selected head belongs to a different department");
      }
    }

    const department = await db.department.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        color: data.color,
        headId: data.headId === undefined ? undefined : data.headId || null,
        archived: data.archived,
      },
    });

    await audit({
      actorId: actor.id, action: "department.update", entity: "department", entityId: id,
      oldValue: { name: before.name, headId: before.headId, archived: before.archived },
      newValue: { name: department.name, headId: department.headId, archived: department.archived },
    });
    return NextResponse.json({ department });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Delete a department.
 *
 * Restricted to Department.Delete (CEO / Operations Manager) — removing a unit
 * of the org chart is not an Account Manager action.
 *
 * A department with members or tasks is archived rather than destroyed: those
 * rows reference it without onDelete:Cascade, so a hard delete would be
 * rejected, and detaching staff from their department would lose reporting
 * history.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Department.Delete");
    const { id } = await params;

    const department = await db.department.findUnique({
      where: { id },
      select: { id: true, name: true, archived: true, _count: { select: { members: true, tasks: true } } },
    });
    if (!department) throw new ApiError(404, "Department not found");

    const inUse = department._count.members + department._count.tasks;
    if (inUse > 0) {
      const updated = await db.department.update({ where: { id }, data: { archived: true } });
      await audit({
        actorId: actor.id, action: "department.archive", entity: "department", entityId: id,
        oldValue: { archived: department.archived },
        newValue: { archived: true, members: department._count.members, tasks: department._count.tasks },
      });
      return NextResponse.json({
        ok: true, archived: true, department: updated,
        message: `${department.name} archived — it still has ${department._count.members} member(s) and ${department._count.tasks} task(s).`,
      });
    }

    // Clear the head reference first so the self-referencing FK cannot block
    // the delete.
    await db.department.update({ where: { id }, data: { headId: null } });
    await db.department.delete({ where: { id } });
    await audit({
      actorId: actor.id, action: "department.delete", entity: "department", entityId: id,
      oldValue: { name: department.name },
    });
    return NextResponse.json({ ok: true, archived: false });
  } catch (e) {
    return toErrorResponse(e);
  }
}
