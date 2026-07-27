import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";

const schema = z.object({
  read: z.literal(true).optional(),
  /** `false` restores a soft-deleted notification (Undo). */
  dismissed: z.literal(false).optional(),
});

/**
 * Mark a single notification as read.
 *
 * Idempotent by design: the update is scoped to `read: false`, so a repeat call
 * (double click, another tab, a retry after a dropped connection) matches zero
 * rows and leaves the original `readAt` intact rather than moving it. Rows are
 * never deleted — read state is an update only, so history stays auditable.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    // Body is optional — an empty PATCH means "mark read".
    const body = schema.parse(await req.json().catch(() => ({})));

    // Undo of a soft delete. Scoped to dismissed rows so a repeat Undo is a
    // no-op rather than an error, and to userId so it can only restore your own.
    if (body.dismissed === false) {
      const { count } = await db.notification.updateMany({
        where: { id, userId: user.id, dismissedAt: { not: null } },
        data: { dismissedAt: null },
      });
      const restored = await db.notification.findFirst({
        where: { id, userId: user.id },
        select: { id: true, read: true, readAt: true, dismissedAt: true },
      });
      if (!restored) throw new ApiError(404, "Notification not found");
      return NextResponse.json({ ok: true, notification: restored, restored: count > 0 });
    }

    // Ownership check and update in one statement: updateMany's where clause
    // carries userId, so one user can never flip another's notification.
    const { count } = await db.notification.updateMany({
      where: { id, userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    });

    if (count === 0) {
      // Either already read (fine — idempotent) or not this user's row (404, so
      // another user's notification ids are not probeable).
      const exists = await db.notification.findFirst({
        where: { id, userId: user.id },
        select: { id: true, read: true, readAt: true },
      });
      if (!exists) throw new ApiError(404, "Notification not found");
      return NextResponse.json({ ok: true, notification: exists, alreadyRead: true });
    }

    const notification = await db.notification.findUnique({
      where: { id },
      select: { id: true, read: true, readAt: true },
    });
    return NextResponse.json({ ok: true, notification });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Dismiss (soft delete) a single notification.
 *
 * The row is kept and stamped with `dismissedAt` rather than destroyed: the
 * notification feed is an audit surface, and Undo then restores by writing the
 * field back to null instead of re-inserting under a new id (which would break
 * the service-worker dedup tag).
 *
 * Idempotent and ownership-scoped for the same reasons as PATCH — the where
 * clause carries `userId`, so one user can never dismiss another's row, and a
 * double click matches zero rows the second time and leaves `dismissedAt` put.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const { count } = await db.notification.updateMany({
      where: { id, userId: user.id, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });

    if (count === 0) {
      const exists = await db.notification.findFirst({
        where: { id, userId: user.id },
        select: { id: true, dismissedAt: true },
      });
      // 404 rather than 403 so another user's ids stay unprobeable.
      if (!exists) throw new ApiError(404, "Notification not found");
      return NextResponse.json({ ok: true, notification: exists, alreadyDismissed: true });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return toErrorResponse(e);
  }
}
