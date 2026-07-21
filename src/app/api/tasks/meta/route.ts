import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { ASSIGNMENT_MATRIX } from "@/lib/rbac";

// Options needed to build task create/edit forms, scoped to the actor's role.
export async function GET() {
  try {
    const user = await requireUser();

    const [projects, clients, labels, departments] = await Promise.all([
      db.project.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.client.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, company: true }, orderBy: { company: "asc" } }),
      db.label.findMany({ orderBy: { name: "asc" } }),
      db.department.findMany({ where: { archived: false }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    ]);

    // Who this user may assign tasks to (workflow constraint)
    const allowedRoles = user.isSuperAdmin
      ? undefined // all
      : ASSIGNMENT_MATRIX[user.roleKey] ?? [];

    const assignable = await db.user.findMany({
      where: {
        status: "ACTIVE",
        ...(allowedRoles ? { role: { key: { in: allowedRoles } } } : {}),
      },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true,
        role: { select: { name: true, key: true } },
      },
      orderBy: [{ role: { level: "asc" } }, { firstName: "asc" }],
    });

    return NextResponse.json({ projects, clients, labels, departments, assignable });
  } catch (e) {
    return toErrorResponse(e);
  }
}
