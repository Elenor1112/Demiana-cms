import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    // Archived departments are hidden unless explicitly requested, so an
    // archived record actually disappears from the UI.
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const departments = await db.department.findMany({
      where: includeArchived ? {} : { archived: false },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        _count: { select: { members: true, tasks: true } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ departments });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  headId: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("Department.Create");
    const data = schema.parse(await req.json());
    const dept = await db.department.create({
      data: { name: data.name, description: data.description, color: data.color ?? "#06B6D4", headId: data.headId || null },
    });
    await audit({ actorId: actor.id, action: "department.create", entity: "department", entityId: dept.id, newValue: { name: dept.name } });
    return NextResponse.json({ department: dept }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
