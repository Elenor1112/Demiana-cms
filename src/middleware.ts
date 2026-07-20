import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ACCESS_COOKIE } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/refresh"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow static + public
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  const payload = token ? await verifyAccessToken(token) : null;

  // API routes: 401 JSON if unauthenticated
  if (pathname.startsWith("/api")) {
    if (!payload) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.next();
  }

  // Pages: redirect to login
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
