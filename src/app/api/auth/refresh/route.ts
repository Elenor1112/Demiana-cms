import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  rotateRefreshToken,
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
} from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  const current = jar.get(REFRESH_COOKIE)?.value;
  if (!current) {
    return NextResponse.json({ error: "No refresh token" }, { status: 401 });
  }
  const rotated = await rotateRefreshToken(current);
  if (!rotated) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }
  const record = await db.refreshToken.findUnique({
    where: { token: rotated.token },
    include: { user: { include: { role: true } } },
  });
  if (!record) {
    await clearAuthCookies();
    return NextResponse.json({ error: "Invalid refresh token" }, { status: 401 });
  }
  const access = await signAccessToken({
    sub: record.user.id,
    email: record.user.email,
    roleKey: record.user.role.key,
  });
  await setAuthCookies(access, rotated.token);
  return NextResponse.json({ ok: true });
}
