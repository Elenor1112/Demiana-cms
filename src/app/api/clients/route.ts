import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    // Archived clients are hidden unless explicitly requested.
    const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
    const search = q
      ? { OR: [{ company: { contains: q, mode: "insensitive" as const } }, { contactPerson: { contains: q, mode: "insensitive" as const } }, { industry: { contains: q, mode: "insensitive" as const } }] }
      : {};
    const clients = await db.client.findMany({
      where: includeArchived ? search : { ...search, status: { not: "ARCHIVED" as const } },
      include: { _count: { select: { projects: true, tasks: true } } },
      orderBy: { company: "asc" },
    });
    return NextResponse.json({ clients });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  company: z.string().min(1),
  contactPerson: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(["ACTIVE", "PROSPECT", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("Client.Create");
    const data = schema.parse(await req.json());
    const client = await db.client.create({ data: { ...data, email: data.email || null } });
    await audit({ actorId: user.id, action: "client.create", entity: "client", entityId: client.id, newValue: { company: client.company } });
    return NextResponse.json({ client }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
