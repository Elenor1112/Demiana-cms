import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const [notifications, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    return toErrorResponse(e);
  }
}
