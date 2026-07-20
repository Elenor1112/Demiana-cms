import "server-only";
import { db } from "./db";
import type { NotificationType } from "@prisma/client";

export async function notify(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  meta?: Record<string, unknown>;
}) {
  return db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta as object | undefined,
    },
  });
}

export async function notifyMany(userIds: string[], input: Omit<Parameters<typeof notify>[0], "userId">) {
  const unique = [...new Set(userIds)];
  await db.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
      meta: input.meta as object | undefined,
    })),
  });
}
