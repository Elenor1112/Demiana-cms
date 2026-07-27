import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse } from "@/lib/api";
import { requireUserDateTime } from "@/lib/timezone";
import { buildApprovalChain, createApprovalSteps } from "@/lib/approvals";

const OFFBOARDING_TEMPLATE = [
  { label: "Return laptop & company equipment", category: "assets" },
  { label: "Return access cards / keys", category: "assets" },
  { label: "Knowledge transfer session completed", category: "knowledge" },
  { label: "Handover of active tasks & clients", category: "handover" },
  { label: "Revoke system & email access", category: "account" },
  { label: "Deactivate Elenor OS account", category: "account" },
  { label: "Exit interview conducted", category: "exit" },
];

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const scope = req.nextUrl.searchParams.get("scope");
    const canManage = user.isSuperAdmin || user.permissions.includes("Resignation.Manage");
    const where = scope === "all" && canManage ? {} : { employeeId: user.id };

    const resignations = await db.resignation.findMany({
      where,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
        checklist: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ resignations });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  reason: z.string().min(5),
  lastWorkingDay: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const data = schema.parse(await req.json());

    const dbUser = await db.user.findUnique({ where: { id: user.id }, include: { department: true, role: true } });

    const resignation = await db.resignation.create({
      data: {
        employeeId: user.id,
        department: dbUser?.department?.name,
        jobTitle: dbUser?.jobTitle ?? dbUser?.role.name,
        reason: data.reason,
        lastWorkingDay: requireUserDateTime(data.lastWorkingDay, "lastWorkingDay"),
        status: "PENDING",
        checklist: { create: OFFBOARDING_TEMPLATE },
      },
    });

    // resignation chain includes CEO (optional final)
    const chain = await buildApprovalChain(user.id, { includeCeo: true });
    if (chain.length) await createApprovalSteps("RESIGNATION", resignation.id, chain);
    else await db.resignation.update({ where: { id: resignation.id }, data: { status: "APPROVED" } });

    // mark user as offboarding
    await db.user.update({ where: { id: user.id }, data: { status: "OFFBOARDING" } });

    await audit({ actorId: user.id, action: "resignation.create", entity: "resignation", entityId: resignation.id });
    return NextResponse.json({ resignation }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
