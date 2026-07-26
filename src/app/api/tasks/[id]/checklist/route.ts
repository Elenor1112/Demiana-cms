import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { canViewTask } from "@/lib/tasks";

const createSchema = z.object({ text: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await canViewTask(user, id))) throw new ApiError(404, "Task not found");
    const { text } = createSchema.parse(await req.json());
    const count = await db.checklistItem.count({ where: { taskId: id } });
    const item = await db.checklistItem.create({ data: { taskId: id, text, order: count } });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const patchSchema = z.object({ itemId: z.string(), done: z.boolean().optional(), text: z.string().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await canViewTask(user, id))) throw new ApiError(404, "Task not found");
    const { itemId, done, text } = patchSchema.parse(await req.json());
    // Scope the update to this task so a visible task cannot be used as a
    // foothold to edit an item belonging to a hidden one.
    const owned = await db.checklistItem.findFirst({ where: { id: itemId, taskId: id }, select: { id: true } });
    if (!owned) throw new ApiError(404, "Checklist item not found");
    const item = await db.checklistItem.update({ where: { id: itemId }, data: { done, text } });
    return NextResponse.json({ item });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    if (!(await canViewTask(user, id))) throw new ApiError(404, "Task not found");
    const itemId = req.nextUrl.searchParams.get("itemId");
    if (!itemId) throw new ApiError(400, "itemId required");
    // Delete only if the item really belongs to this task.
    const { count } = await db.checklistItem.deleteMany({ where: { id: itemId, taskId: id } });
    if (!count) throw new ApiError(404, "Checklist item not found");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
