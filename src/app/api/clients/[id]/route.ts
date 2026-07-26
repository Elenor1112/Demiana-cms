import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const client = await db.client.findUnique({
      where: { id },
      include: {
        projects: { select: { id: true, name: true, status: true, deadline: true } },
        _count: { select: { projects: true, tasks: true } },
      },
    });
    if (!client) throw new ApiError(404, "Client not found");
    return NextResponse.json({ client });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateSchema = z.object({
  company: z.string().min(1).optional(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Client.Edit");
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const before = await db.client.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Client not found");

    const client = await db.client.update({
      where: { id },
      data: { ...data, email: data.email === undefined ? undefined : data.email || null },
    });

    await audit({
      actorId: actor.id, action: "client.update", entity: "client", entityId: id,
      oldValue: { company: before.company, status: before.status },
      newValue: { company: client.company, status: client.status },
    });
    return NextResponse.json({ client });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Delete a client.
 *
 * Clients with projects or tasks are archived instead: those rows reference the
 * client without onDelete:Cascade, so a hard delete would be rejected by the
 * database, and losing the commercial history would be worse than hiding it.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Client.Delete");
    const { id } = await params;

    const client = await db.client.findUnique({
      where: { id },
      select: { id: true, company: true, status: true, _count: { select: { projects: true, tasks: true } } },
    });
    if (!client) throw new ApiError(404, "Client not found");

    const inUse = client._count.projects + client._count.tasks;
    if (inUse > 0) {
      const updated = await db.client.update({ where: { id }, data: { status: "ARCHIVED" } });
      await audit({
        actorId: actor.id, action: "client.archive", entity: "client", entityId: id,
        oldValue: { status: client.status },
        newValue: { status: updated.status, projects: client._count.projects, tasks: client._count.tasks },
      });
      return NextResponse.json({
        ok: true, archived: true, client: updated,
        message: `${client.company} archived — it still has ${client._count.projects} project(s) and ${client._count.tasks} task(s).`,
      });
    }

    await db.client.delete({ where: { id } });
    await audit({
      actorId: actor.id, action: "client.delete", entity: "client", entityId: id,
      oldValue: { company: client.company },
    });
    return NextResponse.json({ ok: true, archived: false });
  } catch (e) {
    return toErrorResponse(e);
  }
}
