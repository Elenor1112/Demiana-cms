import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    // Dismissed notifications are soft-deleted: still on the row for audit, but
    // out of the feed and out of the unread badge.
    const [notifications, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id, dismissedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.notification.count({ where: { userId: user.id, read: false, dismissedAt: null } }),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    return toErrorResponse(e);
  }
}
