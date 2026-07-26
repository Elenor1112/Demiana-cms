import "server-only";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { db } from "./db";
import { ROLE_PERMISSIONS, type SessionUser } from "./rbac";
import type { RoleKey } from "@prisma/client";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret"
);
const REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret"
);

const ACCESS_COOKIE = "elenor_access";
const REFRESH_COOKIE = "elenor_refresh";
/**
 * Strip surrounding quotes and whitespace from an env value.
 *
 * Dashboard UIs (Vercel included) store exactly what is pasted, so a value
 * copied out of a .env file arrives as `"8h"` with the quote characters intact.
 * dotenv strips those locally, which makes the difference invisible until
 * production breaks — jose rejects `"8h"` with "Invalid time period format".
 */
function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "").trim() || undefined;
}

const REFRESH_TTL_DAYS = Number(cleanEnv(process.env.REFRESH_TOKEN_TTL_DAYS) ?? 7) || 7;
const RAW_ACCESS_TTL = cleanEnv(process.env.ACCESS_TOKEN_TTL) ?? "15m";
/** Fall back to a sane default rather than throwing on a malformed value. */
const ACCESS_TOKEN_TTL = /^\d+\s*[smhd]$/.test(RAW_ACCESS_TTL) ? RAW_ACCESS_TTL : "15m";
if (ACCESS_TOKEN_TTL !== RAW_ACCESS_TTL) {
  console.error(
    `[auth] ACCESS_TOKEN_TTL="${RAW_ACCESS_TTL}" is not a valid duration ` +
      `(expected e.g. 15m, 8h, 7d). Falling back to ${ACCESS_TOKEN_TTL}.`
  );
}

/**
 * Parse a jose-style duration ("30s", "15m", "8h", "7d") into seconds so the
 * access cookie's maxAge always matches the JWT's own expiry. These previously
 * drifted apart: the cookie was hardcoded to 15 minutes while the token TTL was
 * configurable, so raising ACCESS_TOKEN_TTL had no effect.
 */
export function parseDurationSeconds(input: string, fallback = 900) {
  const match = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = match[2] as "s" | "m" | "h" | "d";
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

const ACCESS_MAX_AGE = parseDurationSeconds(ACCESS_TOKEN_TTL);

// ─── Password ───
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

// ─── Access token (short-lived JWT) ───
export async function signAccessToken(payload: {
  sub: string;
  email: string;
  roleKey: RoleKey;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(ACCESS_SECRET);
}

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    return payload as { sub: string; email: string; roleKey: RoleKey };
  } catch {
    return null;
  }
}

// ─── Refresh token (opaque, stored in DB, rotated) ───
export async function issueRefreshToken(
  userId: string,
  meta?: { userAgent?: string; ip?: string }
) {
  const token = randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 864e5);
  await db.refreshToken.create({
    data: { token, userId, expiresAt, userAgent: meta?.userAgent, ip: meta?.ip },
  });
  return { token, expiresAt };
}

export async function rotateRefreshToken(oldToken: string) {
  const existing = await db.refreshToken.findUnique({ where: { token: oldToken } });
  if (!existing || existing.revoked || existing.expiresAt < new Date()) return null;
  await db.refreshToken.update({
    where: { token: oldToken },
    data: { revoked: true },
  });
  return issueRefreshToken(existing.userId);
}

export async function revokeRefreshToken(token: string) {
  await db.refreshToken
    .update({ where: { token }, data: { revoked: true } })
    .catch(() => {});
}

// ─── Cookie helpers ───
export async function setAuthCookies(access: string, refresh: string) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  jar.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * REFRESH_TTL_DAYS,
  });
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

// ─── Session resolution ───
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  if (!access) return null;
  const payload = await verifyAccessToken(access);
  if (!payload?.sub) return null;
  return loadSessionUser(payload.sub);
}

export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: true,
      permissions: { include: { permission: true } },
    },
  });
  if (!user || user.status === "DEACTIVATED") return null;

  const roleKey = user.role.key;
  const rolePerms = new Set<string>(ROLE_PERMISSIONS[roleKey] ?? []);
  for (const grant of user.permissions) {
    if (grant.effect === "ALLOW") rolePerms.add(grant.permission.key);
    else rolePerms.delete(grant.permission.key);
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleKey,
    isSuperAdmin: user.role.isSuperAdmin,
    permissions: [...rolePerms],
  };
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
