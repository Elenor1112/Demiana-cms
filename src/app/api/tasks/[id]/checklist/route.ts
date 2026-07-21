import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";

const createSchema = z.object({ text: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
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
    await requireUser();
    await params;
    const { itemId, done, text } = patchSchema.parse(await req.json());
    const item = await db.checklistItem.update({ where: { id: itemId }, data: { done, text } });
    return NextResponse.json({ item });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    await params;
    const itemId = req.nextUrl.searchParams.get("itemId");
    if (!itemId) throw new ApiError(400, "itemId required");
    await db.checklistItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
