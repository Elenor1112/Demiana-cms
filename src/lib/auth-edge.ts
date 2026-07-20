import { jwtVerify } from "jose";
import type { RoleKey } from "@prisma/client";

// Edge-safe subset used by middleware (no Node APIs, no Prisma).

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET ?? "dev-access-secret"
);

export const ACCESS_COOKIE = "elenor_access";

export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    return payload as { sub: string; email: string; roleKey: RoleKey };
  } catch {
    return null;
  }
}
