import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { ROLE_META } from "@/lib/rbac";
import type { RoleKey } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim();
    const dept = searchParams.get("department");
    const role = searchParams.get("role") as RoleKey | null;
    const status = searchParams.get("status");

    const employees = await db.user.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { jobTitle: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          dept ? { departmentId: dept } : {},
          role ? { role: { key: role } } : {},
          status ? { status: status as never } : {},
        ],
      },
      include: {
        role: true,
        department: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { assignedTasks: true } },
      },
      orderBy: [{ role: { level: "asc" } }, { firstName: "asc" }],
    });

    return NextResponse.json({ employees });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleKey: z.string(),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("Employee.Create");
    const body = await req.json();
    const data = createSchema.parse(body);

    if (!(data.roleKey in ROLE_META)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const role = await db.role.findUnique({ where: { key: data.roleKey as RoleKey } });
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 400 });

    const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

    const user = await db.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        jobTitle: data.jobTitle,
        roleId: role.id,
        departmentId: data.departmentId || null,
        managerId: data.managerId || null,
        passwordHash: await hashPassword(data.password),
        status: "ACTIVE",
      },
      include: { role: true, department: true },
    });

    await audit({
      actorId: actor.id,
      action: "employee.create",
      entity: "user",
      entityId: user.id,
      newValue: { email: user.email, role: data.roleKey },
    });

    return NextResponse.json({ employee: user }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
