import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { logActivity } from "@/lib/tasks";
import { notifyMany } from "@/lib/notify";

const schema = z.object({
  body: z.string().min(1),
  mentions: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const data = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id },
      include: { assignees: true },
    });
    if (!task) throw new ApiError(404, "Task not found");

    const comment = await db.comment.create({
      data: { body: data.body, authorId: user.id, taskId: id, mentions: data.mentions },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });

    await logActivity({ actorId: user.id, taskId: id, verb: "commented" });

    // notify assignees + creator + mentions
    const recipients = new Set<string>([
      ...task.assignees.map((a) => a.userId),
      task.createdById,
      ...data.mentions,
    ]);
    recipients.delete(user.id);
    if (recipients.size) {
      await notifyMany([...recipients], {
        type: data.mentions.length ? "MENTIONED" : "COMMENT_ADDED",
        title: `${user.firstName} commented on ${task.code}`,
        body: data.body.slice(0, 100),
        link: `/tasks?task=${id}`,
      });
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
