import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { decideStep, getSteps } from "@/lib/approvals";
import { notify } from "@/lib/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const resignation = await db.resignation.findUnique({
      where: { id },
      include: { employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } }, checklist: true },
    });
    if (!resignation) throw new ApiError(404, "Not found");
    const steps = await getSteps("RESIGNATION", id);
    return NextResponse.json({ resignation, steps });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  action: z.enum(["approve", "reject", "toggleItem"]),
  comment: z.string().optional(),
  itemId: z.string().optional(),
  done: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const data = schema.parse(await req.json());

    if (data.action === "toggleItem") {
      await requirePermission("Resignation.Manage");
      if (!data.itemId) throw new ApiError(400, "itemId required");
      await db.offboardingItem.update({ where: { id: data.itemId }, data: { done: data.done } });
      return NextResponse.json({ ok: true });
    }

    const resignation = await db.resignation.findUnique({ where: { id } });
    if (!resignation) throw new ApiError(404, "Not found");
    if (resignation.status !== "PENDING") throw new ApiError(400, "Not pending");

    const outcome = await decideStep({ kind: "RESIGNATION", entityId: id, actorId: user.id, approve: data.action === "approve", comment: data.comment });

    if (outcome === "REJECTED") {
      await db.resignation.update({ where: { id }, data: { status: "REJECTED" } });
      await db.user.update({ where: { id: resignation.employeeId }, data: { status: "ACTIVE" } });
      await notify({ userId: resignation.employeeId, type: "ANNOUNCEMENT", title: "Resignation not accepted", body: data.comment, link: "/settings" });
    } else if (outcome === "APPROVED") {
      await db.resignation.update({ where: { id }, data: { status: "APPROVED" } });
      await notify({ userId: resignation.employeeId, type: "ANNOUNCEMENT", title: "Resignation accepted", body: "HR will proceed with offboarding.", link: "/settings" });
    }

    await audit({ actorId: user.id, action: `resignation.${data.action}`, entity: "resignation", entityId: id });
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return toErrorResponse(e);
  }
}
