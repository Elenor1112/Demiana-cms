import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { maskClientContact, canViewClientContact, CLIENT_CONTACT_FIELDS } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const client = await db.client.findUnique({
      where: { id },
      include: {
        projects: { select: { id: true, name: true, status: true, deadline: true } },
        _count: { select: { projects: true, tasks: true } },
        accountManager: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    if (!client) throw new ApiError(404, "Client not found");
    // The record stays readable — only the confidential contact fields are
    // stripped, and only for viewers who are not the CEO, the Operations
    // Manager, or this client's own account manager.
    return NextResponse.json({ client: maskClientContact(user, client) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateSchema = z.object({
  company: z.string().min(1).optional(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().optional().nullable(),
  accountManagerId: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Client.Edit");
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const before = await db.client.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Client not found");

    // Someone who may not READ the contact details may not WRITE them either.
    // Without this, an unauthorised editor could overwrite a phone number they
    // cannot see — and, by saving the form back, silently blank every masked
    // field, since the UI sends nulls for the values it was never given.
    const attemptedContact = CLIENT_CONTACT_FIELDS.filter((f) => data[f] !== undefined);
    if (attemptedContact.length && !canViewClientContact(actor, before)) {
      throw new ApiError(
        403,
        `You are not authorised to change this client's contact details: ${attemptedContact.join(", ")}.`
      );
    }

    // Reassigning the account manager hands over who can see those details, so
    // it stays with the super admins rather than any holder of Client.Edit.
    if (data.accountManagerId !== undefined && data.accountManagerId !== before.accountManagerId
        && !actor.isSuperAdmin) {
      throw new ApiError(403, "Only the CEO or Operations Manager can reassign the account manager.");
    }

    const client = await db.client.update({
      where: { id },
      data: {
        ...data,
        email: data.email === undefined ? undefined : data.email || null,
        accountManagerId:
          data.accountManagerId === undefined ? undefined : data.accountManagerId || null,
      },
    });

    await audit({
      actorId: actor.id, action: "client.update", entity: "client", entityId: id,
      oldValue: { company: before.company, status: before.status, accountManagerId: before.accountManagerId },
      newValue: { company: client.company, status: client.status, accountManagerId: client.accountManagerId },
    });
    return NextResponse.json({ client: maskClientContact(actor, client) });
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
