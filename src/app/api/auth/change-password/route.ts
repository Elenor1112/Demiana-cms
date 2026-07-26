import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  verifyPassword,
  hashPassword,
  signAccessToken,
  issueRefreshToken,
  setAuthCookies,
} from "@/lib/auth";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200)
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { currentPassword, newPassword } = parsed.data;

    const user = await db.user.findUnique({ where: { id: session.id }, include: { role: true } });
    if (!user) throw new ApiError(404, "User not found");

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApiError(400, "Current password is incorrect");
    }
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new ApiError(400, "New password must be different from the current one");
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
    });

    // Revoke every existing session, then re-issue for this device only.
    await db.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } });

    const ip = req.headers.get("x-forwarded-for") ?? undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const access = await signAccessToken({ sub: user.id, email: user.email, roleKey: user.role.key });
    const { token: refresh } = await issueRefreshToken(user.id, { ip, userAgent });
    await setAuthCookies(access, refresh);

    await audit({
      actorId: user.id,
      action: "auth.password_change",
      entity: "user",
      entityId: user.id,
      ip,
      device: userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
