import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { decideStep } from "@/lib/approvals";
import { notify } from "@/lib/notify";

const schema = z.object({ action: z.enum(["approve", "reject", "cancel"]), comment: z.string().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action, comment } = schema.parse(await req.json());

    const reqRow = await db.permissionRequest.findUnique({ where: { id } });
    if (!reqRow) throw new ApiError(404, "Not found");

    if (action === "cancel") {
      if (reqRow.requesterId !== user.id) throw new ApiError(403, "Only requester can cancel");
      await db.permissionRequest.update({ where: { id }, data: { status: "CANCELLED" } });
      return NextResponse.json({ ok: true });
    }

    if (reqRow.status !== "PENDING") throw new ApiError(400, "Not pending");

    const outcome = await decideStep({ kind: "PERMISSION", entityId: id, actorId: user.id, approve: action === "approve", comment });

    if (outcome === "REJECTED") {
      await db.permissionRequest.update({ where: { id }, data: { status: "REJECTED", rejectionReason: comment ?? "No reason" } });
      await notify({ userId: reqRow.requesterId, type: "LEAVE_REJECTED", title: "Permission request rejected", body: comment, link: "/permissions" });
    } else if (outcome === "APPROVED") {
      await db.permissionRequest.update({ where: { id }, data: { status: "APPROVED" } });
      await notify({ userId: reqRow.requesterId, type: "PERMISSION_APPROVED", title: "Permission approved", link: "/permissions" });
    }

    await audit({ actorId: user.id, action: `permission.${action}`, entity: "permission", entityId: id });
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return toErrorResponse(e);
  }
}
