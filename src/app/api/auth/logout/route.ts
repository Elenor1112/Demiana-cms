import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAuthCookies, revokeRefreshToken, REFRESH_COOKIE } from "@/lib/auth";

export async function POST() {
  const jar = await cookies();
  const refresh = jar.get(REFRESH_COOKIE)?.value;
  if (refresh) await revokeRefreshToken(refresh);
  await clearAuthCookies();
  return NextResponse.json({ ok: true });
}
