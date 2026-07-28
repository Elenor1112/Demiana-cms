import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { parseUserDateTime } from "@/lib/timezone";

export async function GET() {
  try {
    await requireUser();
    const projects = await db.project.findMany({
      include: {
        client: { select: { id: true, company: true } },
        lead: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        _count: { select: { tasks: true } },
        tasks: { where: { parentId: null }, select: { status: true, progress: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const withProgress = projects.map((p) => {
      const active = p.tasks.filter((t) => t.status !== "CANCELLED");
      const progress = active.length
        ? Math.round(active.reduce((s, t) => s + (t.status === "DONE" ? 100 : t.progress), 0) / active.length)
        : 0;
      const { tasks, ...rest } = p;
      return { ...rest, progress };
    });

    return NextResponse.json({ projects: withProgress });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // Mandatory: a project is always work done FOR a client, and every task under
  // it inherits that client.
  clientId: z.string().min(1, "A client is required"),
  industry: z.string().optional(),
  leadId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  memberIds: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("Project.Create");
    const data = schema.parse(await req.json());

    // Verify the client exists before creating: the FK would reject it anyway,
    // but as an opaque constraint error rather than a usable message.
    const client = await db.client.findUnique({
      where: { id: data.clientId },
      select: { id: true },
    });
    if (!client) throw new ApiError(400, "The selected client does not exist.");

    const project = await db.project.create({
      data: {
        name: data.name,
        description: data.description,
        clientId: data.clientId,
        industry: data.industry,
        leadId: data.leadId || user.id,
        startDate: data.startDate ? parseUserDateTime(data.startDate) : null,
        deadline: data.deadline ? parseUserDateTime(data.deadline) : null,
        status: "ACTIVE",
        members: { create: data.memberIds.map((userId) => ({ userId })) },
      },
    });
    await audit({ actorId: user.id, action: "project.create", entity: "project", entityId: project.id, newValue: { name: project.name } });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
