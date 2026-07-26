import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";

const schema = z.object({
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200)
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  mustChangePassword: z.boolean().optional().default(true),
});

/** Admin password reset. Does not require the target's current password. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("Employee.EditPermissions");
    const { id } = await params;
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const target = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) throw new ApiError(404, "Employee not found");

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: parsed.data.mustChangePassword,
      },
    });

    // Force the target to sign in again everywhere.
    await db.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } });

    await audit({
      actorId: actor.id,
      action: "employee.password_reset",
      entity: "user",
      entityId: id,
      newValue: { email: target.email, mustChangePassword: parsed.data.mustChangePassword },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      device: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
