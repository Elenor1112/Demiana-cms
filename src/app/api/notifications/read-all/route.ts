import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    // Scoped to unread so already-read rows keep their original readAt, and to
    // undismissed so "mark all read" only touches what the user can actually see.
    const { count } = await db.notification.updateMany({
      where: { userId: user.id, read: false, dismissedAt: null },
      data: { read: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return toErrorResponse(e);
  }
}
