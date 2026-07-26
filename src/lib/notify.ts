import "server-only";
import { db } from "./db";
import { sendPushToUsers, type PushPayload } from "./push";
import type { NotificationType } from "@prisma/client";

/**
 * Notification types that warrant interrupting the user with a native browser
 * notification. Everything else is still written to the notification centre and
 * shows on the bell, but does not raise an OS-level alert.
 */
const PUSH_WORTHY = new Set<NotificationType>([
  "TASK_ASSIGNED",
  "MENTIONED",
  "APPROVAL_REQUIRED",
  "DEADLINE_REMINDER",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "PERMISSION_APPROVED",
  "WARNING",
]);

/** Lower-signal types deliver without sound/vibration. */
const SILENT_TYPES = new Set<NotificationType>(["COMMENT_ADDED", "DEADLINE_REMINDER"]);

type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
};

/** Pull a taskId out of the link (`/tasks?task=<id>`) or explicit meta. */
function extractTaskId(input: { link?: string; meta?: Record<string, unknown> }) {
  const fromMeta = input.meta?.taskId;
  if (typeof fromMeta === "string") return fromMeta;
  const match = input.link?.match(/[?&]task=([^&]+)/);
  return match?.[1];
}

/**
 * Fan a stored notification out to the browser as well.
 *
 * Deliberately fire-and-forget with its own catch: a push failure must never
 * fail the action that triggered it.
 */
async function fanOutPush(
  rows: { id: string; userId: string }[],
  input: Omit<NotifyInput, "userId">
) {
  if (!PUSH_WORTHY.has(input.type) || !rows.length) return;

  const base = {
    type: input.type,
    title: input.title,
    body: input.body,
    taskId: extractTaskId(input),
    assignedBy: typeof input.meta?.assignedBy === "string" ? input.meta.assignedBy : undefined,
    createdAt: new Date().toISOString(),
    url: input.link ?? "/dashboard",
    silent: SILENT_TYPES.has(input.type),
  };

  // One send per recipient so each carries its own notification id as the
  // service-worker dedup tag.
  await Promise.all(
    rows.map((row) =>
      sendPushToUsers([row.userId], { ...base, id: row.id }).catch((e) =>
        console.error("[notify] push fan-out", e)
      )
    )
  );
}

export async function notify(input: NotifyInput) {
  const row = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta as object | undefined,
    },
  });

  await fanOutPush([{ id: row.id, userId: row.userId }], input);
  return row;
}

export async function notifyMany(userIds: string[], input: Omit<NotifyInput, "userId">) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return;

  // createMany does not return generated ids, and each recipient's push needs
  // its own notification id as the dedup tag. Creating rows individually inside
  // one transaction keeps that per-row id while staying a single round trip.
  const rows = await db.$transaction(
    unique.map((userId) =>
      db.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link,
          meta: input.meta as object | undefined,
        },
        select: { id: true, userId: true },
      })
    )
  );

  await fanOutPush(rows, input);
}
