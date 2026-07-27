import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";

const schema = z.object({
  read: z.literal(true).default(true),
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
    schema.parse(await req.json().catch(() => ({})));

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
