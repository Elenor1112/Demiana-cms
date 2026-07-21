import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { ROLE_PERMISSIONS, PERMISSIONS, type PermissionKey } from "@/lib/rbac";

// Returns the user's role-derived permissions + per-user overrides, resolved.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("Employee.EditPermissions");
    const { id } = await params;
    const user = await db.user.findUnique({
      where: { id },
      include: { role: true, permissions: { include: { permission: true } } },
    });
    if (!user) throw new ApiError(404, "Employee not found");

    const rolePerms = new Set(ROLE_PERMISSIONS[user.role.key] ?? []);
    const overrides = Object.fromEntries(
      user.permissions.map((p) => [p.permission.key, p.effect])
    );

    const matrix = (Object.keys(PERMISSIONS) as PermissionKey[]).map((key) => {
      const fromRole = user.role.isSuperAdmin || rolePerms.has(key);
      const override = overrides[key]; // ALLOW | DENY | undefined
      const effective =
        override === "DENY" ? false : override === "ALLOW" ? true : fromRole;
      return { key, description: PERMISSIONS[key], group: key.split(".")[0], fromRole, override: override ?? null, effective };
    });

    return NextResponse.json({ matrix, isSuperAdmin: user.role.isSuperAdmin, roleKey: user.role.key });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  permissionKey: z.string(),
  effect: z.enum(["ALLOW", "DENY", "INHERIT"]),
});

// Set a per-user override (or clear it with INHERIT).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Employee.EditPermissions");
    const { id } = await params;
    const { permissionKey, effect } = schema.parse(await req.json());

    const permission = await db.permission.findUnique({ where: { key: permissionKey } });
    if (!permission) throw new ApiError(400, "Unknown permission");

    if (effect === "INHERIT") {
      await db.userPermission.deleteMany({ where: { userId: id, permissionId: permission.id } });
    } else {
      await db.userPermission.upsert({
        where: { userId_permissionId: { userId: id, permissionId: permission.id } },
        update: { effect },
        create: { userId: id, permissionId: permission.id, effect },
      });
    }

    await audit({
      actorId: actor.id,
      action: "employee.permission.override",
      entity: "user",
      entityId: id,
      newValue: { permission: permissionKey, effect },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
