import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import type { RoleKey } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const employee = await db.user.findUnique({
      where: { id },
      include: {
        role: true,
        department: true,
        manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
        reports: {
          select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true, role: { select: { name: true } } },
        },
        warnings: { include: { issuedBy: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" } },
        achievements: { orderBy: { awardedAt: "desc" } },
        documents: { orderBy: { createdAt: "desc" } },
        _count: { select: { assignedTasks: true, leaveRequests: true } },
      },
    });
    if (!employee) throw new ApiError(404, "Employee not found");

    const { passwordHash, ...safe } = employee;
    return NextResponse.json({ employee: safe });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  jobTitle: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  roleKey: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  status: z.string().optional(),
  annualLeaveBalance: z.number().int().min(0).optional(),
  sickLeaveBalance: z.number().int().min(0).optional(),
  birthDate: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Employee.Edit");
    const { id } = await params;
    const data = updateSchema.parse(await req.json());

    const before = await db.user.findUnique({ where: { id }, include: { role: true } });
    if (!before) throw new ApiError(404, "Employee not found");

    let roleId: string | undefined;
    if (data.roleKey) {
      const role = await db.role.findUnique({ where: { key: data.roleKey as RoleKey } });
      if (!role) throw new ApiError(400, "Invalid role");
      roleId = role.id;
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        jobTitle: data.jobTitle,
        phone: data.phone,
        roleId,
        departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
        managerId: data.managerId === undefined ? undefined : data.managerId || null,
        status: data.status as never,
        annualLeaveBalance: data.annualLeaveBalance,
        sickLeaveBalance: data.sickLeaveBalance,
        birthDate: data.birthDate ? new Date(data.birthDate) : data.birthDate === null ? null : undefined,
        hireDate: data.hireDate ? new Date(data.hireDate) : data.hireDate === null ? null : undefined,
      },
      include: { role: true, department: true },
    });

    await audit({
      actorId: actor.id,
      action: "employee.update",
      entity: "user",
      entityId: id,
      oldValue: { role: before.role.key, status: before.status, jobTitle: before.jobTitle },
      newValue: { role: updated.role.key, status: updated.status, jobTitle: updated.jobTitle },
    });

    return NextResponse.json({ employee: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Employee.Delete");
    const { id } = await params;
    if (id === actor.id) throw new ApiError(400, "You cannot deactivate yourself");

    // Soft delete (deactivate) — preserves audit/task history.
    const user = await db.user.update({
      where: { id },
      data: { status: "DEACTIVATED" },
    });
    await db.refreshToken.updateMany({ where: { userId: id }, data: { revoked: true } });

    await audit({ actorId: actor.id, action: "employee.deactivate", entity: "user", entityId: id, newValue: { status: "DEACTIVATED" } });

    return NextResponse.json({ ok: true, employee: { id: user.id, status: user.status } });
  } catch (e) {
    return toErrorResponse(e);
  }
}
