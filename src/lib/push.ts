import "server-only";
import webpush, { type PushSubscription as WebPushSub } from "web-push";
import { db } from "./db";
import type { NotificationType } from "@prisma/client";

/**
 * Web Push (VAPID) delivery.
 *
 * Why Web Push and not WebSockets/SSE: this app is deployed to Vercel
 * serverless, where functions are short-lived and share no process, so there is
 * nowhere to hold a persistent connection. Web Push routes through the browser
 * vendor's push service, which wakes our service worker even with no tab open —
 * the only approach that satisfies "notify when minimised or closed".
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:elenor.marketing@gmail.com";

let configured = false;
/** Configure web-push lazily so a missing key never breaks an unrelated route. */
function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

export function pushConfigured() {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

/** Payload delivered to the service worker. Keep in sync with public/sw.js. */
export type PushPayload = {
  id: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  taskId?: string;
  assignedBy?: string;
  createdAt: string;
  url: string;
  /** Deliver without sound/vibration for low-signal events. */
  silent?: boolean;
};

/**
 * Send a payload to every registered device for these users.
 *
 * Never throws: notification delivery is best-effort and must not roll back or
 * fail the business action (assigning a task, posting a comment) that caused
 * it. Subscriptions rejected as gone (404/410) are pruned.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return { sent: 0, failed: 0, pruned: 0 };

  if (!ensureConfigured()) {
    // Not an error in local dev without keys — in-app notifications still work.
    console.warn("[push] VAPID keys not configured; skipping browser push.");
    return { sent: 0, failed: 0, pruned: 0 };
  }

  const subs = await db.pushSubscription.findMany({ where: { userId: { in: unique } } });
  if (!subs.length) return { sent: 0, failed: 0, pruned: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const target: WebPushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(target, body, {
          TTL: 60 * 60 * 24, // keep for a day if the device is offline
          urgency: payload.silent ? "low" : "normal",
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the browser discarded this subscription for good.
        if (status === 404 || status === 410) gone.push(sub.endpoint);
        else console.error("[push] send failed", status, (err as Error).message);
        failed++;
      }
    })
  );

  if (gone.length) {
    await db.pushSubscription
      .deleteMany({ where: { endpoint: { in: gone } } })
      .catch((e) => console.error("[push] prune failed", e));
  }

  return { sent, failed, pruned: gone.length };
}
