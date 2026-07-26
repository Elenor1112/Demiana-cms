import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { sendPushToUsers } from "@/lib/push";

/**
 * Send a test push to the caller's own devices only.
 * Used by the "Send test notification" button in Settings.
 */
export async function POST() {
  try {
    const user = await requireUser();
    const result = await sendPushToUsers([user.id], {
      id: `test:${Date.now()}`,
      type: "ANNOUNCEMENT",
      title: "Elenor OS test notification",
      body: "Browser notifications are working. You can close this.",
      createdAt: new Date().toISOString(),
      url: "/settings",
    });
    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
