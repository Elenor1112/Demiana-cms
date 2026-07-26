import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ACCESS_COOKIE, REFRESH_COOKIE } from "@/lib/auth-edge";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/refresh"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow static + public
  // /sw.js and /icons/* must be served directly: the browser fetches the
  // service worker outside any session and will refuse a redirect, and the
  // worker itself renders notification icons with no cookies attached.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/") ||
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

  // Pages: if the access token has expired but a refresh cookie is still
  // present, silently re-authenticate instead of bouncing the user to /login.
  if (!payload) {
    const url = req.nextUrl.clone();
    const hasRefresh = Boolean(req.cookies.get(REFRESH_COOKIE)?.value);
    if (hasRefresh) {
      url.pathname = "/api/auth/refresh/silent";
      url.search = "";
      url.searchParams.set("to", pathname + req.nextUrl.search);
      return NextResponse.redirect(url);
    }
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
