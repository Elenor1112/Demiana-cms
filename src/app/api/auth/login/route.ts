import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  setAuthCookies,
  loadSessionUser,
} from "@/lib/auth";
import { audit } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });
  if (!user || user.status === "DEACTIVATED") {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const access = await signAccessToken({ sub: user.id, email: user.email, roleKey: user.role.key });
  const ip = req.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const { token: refresh } = await issueRefreshToken(user.id, { ip, userAgent });
  await setAuthCookies(access, refresh);

  await audit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, ip, device: userAgent });

  const session = await loadSessionUser(user.id);
  return NextResponse.json({ user: session });
}
