import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    // Scoped to unread so already-read rows keep their original readAt.
    const { count } = await db.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return toErrorResponse(e);
  }
}
