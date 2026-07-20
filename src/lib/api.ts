import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "./auth";
import { can, type PermissionKey, type SessionUser } from "./rbac";
import { db } from "./db";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Require a logged-in user. Throws ApiError(401) otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "Not authenticated");
  return user;
}

/** Require a specific permission. Throws 401/403. */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) throw new ApiError(403, `Missing permission: ${permission}`);
  return user;
}

/** Wrap a route handler with error → JSON translation. */
export function handler<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      const data = await fn();
      return NextResponse.json(data);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/** Record an audit log entry. */
export async function audit(opts: {
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string;
  device?: string;
}) {
  await db.auditLog
    .create({
      data: {
        actorId: opts.actorId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        oldValue: opts.oldValue === undefined ? undefined : (opts.oldValue as object),
        newValue: opts.newValue === undefined ? undefined : (opts.newValue as object),
        ip: opts.ip,
        device: opts.device,
      },
    })
    .catch((e) => console.error("audit failed", e));
}
