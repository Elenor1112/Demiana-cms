import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { requireSalesModule } from "@/lib/sales";
import { can } from "@/lib/rbac";
import { ideaCreateSchema } from "@/lib/sales-schemas";
import type { IdeaStatus, Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    if (!can(user, "Sales.IdeaManage")) {
      throw new ApiError(403, "Missing permission: Sales.IdeaManage");
    }

    const sp = req.nextUrl.searchParams;
    const status = sp.getAll("status").filter(Boolean) as IdeaStatus[];
    const q = sp.get("q")?.trim();
    const leadId = sp.get("lead");
    const clientId = sp.get("client");

    // Ideas are an internal backlog rather than client-confidential data, so
    // anyone holding Sales.IdeaManage sees the whole board — matching how the
    // brief describes it ("allow conversion into Tasks or Projects").
    const where: Prisma.SalesIdeaWhereInput = {
      ...(status.length ? { status: { in: status } } : {}),
      ...(leadId ? { leadId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const ideas = await db.salesIdea.findMany({
      where,
      include: {
        owner: userPick,
        createdBy: userPick,
        lead: { select: { id: true, code: true, companyName: true } },
        client: { select: { id: true, company: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 300,
    });

    return NextResponse.json({ ideas });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    // Sales.IdeaManage alone is not enough: Account Management holds it for its
    // own accounts but has no Sales workspace access, so the module gate is
    // applied on top rather than relying on the permission by itself.
    const user = requireSalesModule(await requirePermission("Sales.IdeaManage"));
    const data = ideaCreateSchema.parse(await req.json());

    // Validate the optional links so a typo becomes a 400 rather than a
    // foreign-key error surfacing as a 500.
    if (data.leadId) {
      const lead = await db.lead.findUnique({ where: { id: data.leadId }, select: { id: true } });
      if (!lead) throw new ApiError(400, "The selected lead does not exist.");
    }
    if (data.clientId) {
      const client = await db.client.findUnique({ where: { id: data.clientId }, select: { id: true } });
      if (!client) throw new ApiError(400, "The selected client does not exist.");
    }

    const idea = await db.salesIdea.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        leadId: data.leadId || null,
        clientId: data.clientId || null,
        priority: data.priority,
        estimatedImpact: data.estimatedImpact,
        status: data.status,
        // Unowned ideas default to their author, so nothing sits in the backlog
        // with nobody accountable for triaging it.
        ownerId: data.ownerId || user.id,
        createdById: user.id,
      },
      include: {
        owner: userPick,
        createdBy: userPick,
        lead: { select: { id: true, code: true, companyName: true } },
        client: { select: { id: true, company: true } },
      },
    });

    await audit({
      actorId: user.id, action: "sales.idea.create", entity: "salesIdea", entityId: idea.id,
      newValue: { title: idea.title, status: idea.status, leadId: idea.leadId, clientId: idea.clientId },
    });

    return NextResponse.json({ idea }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
