import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  rotateRefreshToken,
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_COOKIE,
} from "@/lib/auth";

/**
 * Silent re-authentication for page navigations.
 *
 * Middleware runs on the edge and cannot touch Prisma, so it cannot rotate a
 * refresh token itself. When it sees an expired access cookie alongside a valid
 * refresh cookie it redirects here; this route mints a fresh access token and
 * sends the user on to where they were going. The result is that a session
 * stays alive for the full refresh window without the user noticing.
 */
export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to") || "/dashboard";
  // Only ever redirect to a path on this origin — never an absolute URL, or
  // this becomes an open redirect.
  const safePath = to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard";
  const destination = new URL(safePath, req.nextUrl.origin);
  const loginUrl = new URL("/login", req.nextUrl.origin);
  loginUrl.searchParams.set("from", safePath);

  const jar = await cookies();
  const current = jar.get(REFRESH_COOKIE)?.value;
  if (!current) return NextResponse.redirect(loginUrl);

  const rotated = await rotateRefreshToken(current);
  if (!rotated) {
    await clearAuthCookies();
    return NextResponse.redirect(loginUrl);
  }

  const record = await db.refreshToken.findUnique({
    where: { token: rotated.token },
    include: { user: { include: { role: true } } },
  });
  if (!record || record.user.status === "DEACTIVATED") {
    await clearAuthCookies();
    return NextResponse.redirect(loginUrl);
  }

  const access = await signAccessToken({
    sub: record.user.id,
    email: record.user.email,
    roleKey: record.user.role.key,
  });
  await setAuthCookies(access, rotated.token);

  // no-store so the browser never serves this redirect from cache.
  return NextResponse.redirect(destination, {
    headers: { "Cache-Control": "no-store" },
  });
}
