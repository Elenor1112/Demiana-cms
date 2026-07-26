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

    // Mentions and plain comments are notified separately: only a real mention
    // should raise a push, so typing everyone as MENTIONED would spam people
    // who merely follow the task.
    const actor = `${user.firstName} ${user.lastName}`;
    const meta = { taskId: id, assignedBy: actor };
    const mentioned = new Set<string>(data.mentions);
    mentioned.delete(user.id);

    const watchers = new Set<string>([
      ...task.assignees.map((a) => a.userId),
      task.createdById,
    ]);
    watchers.delete(user.id);
    for (const uid of mentioned) watchers.delete(uid);

    if (mentioned.size) {
      await notifyMany([...mentioned], {
        type: "MENTIONED",
        title: `${actor} mentioned you`,
        body: data.body.slice(0, 100),
        link: `/tasks?task=${id}`,
        meta,
      });
    }
    if (watchers.size) {
      await notifyMany([...watchers], {
        type: "COMMENT_ADDED",
        title: `${user.firstName} commented on ${task.code}`,
        body: data.body.slice(0, 100),
        link: `/tasks?task=${id}`,
        meta,
      });
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
