import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { decideStep, getSteps } from "@/lib/approvals";
import { notify } from "@/lib/notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const request = await db.leaveRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
        actingUser: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!request) throw new ApiError(404, "Not found");
    const steps = await getSteps("LEAVE", id);
    return NextResponse.json({ request, steps });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  comment: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { action, comment } = schema.parse(await req.json());

    const leave = await db.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new ApiError(404, "Not found");

    // Cancel (by requester only, while pending)
    if (action === "cancel") {
      if (leave.requesterId !== user.id) throw new ApiError(403, "Only the requester can cancel");
      await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
      return NextResponse.json({ ok: true });
    }

    if (leave.status !== "PENDING") throw new ApiError(400, "Request is not pending");

    const outcome = await decideStep({
      kind: "LEAVE",
      entityId: id,
      actorId: user.id,
      approve: action === "approve",
      comment,
    });

    if (outcome === "REJECTED") {
      await db.leaveRequest.update({
        where: { id },
        data: { status: "REJECTED", rejectionReason: comment ?? "No reason provided", rejectedById: user.id },
      });
      await notify({
        userId: leave.requesterId,
        type: "LEAVE_REJECTED",
        title: "Leave request rejected",
        body: `Rejected by ${user.firstName} ${user.lastName}${comment ? `: ${comment}` : ""}`,
        link: "/leave",
      });
    } else if (outcome === "APPROVED") {
      // deduct balance on final approval
      await db.leaveRequest.update({ where: { id }, data: { status: "APPROVED" } });
      if (leave.type === "ANNUAL") {
        await db.user.update({ where: { id: leave.requesterId }, data: { annualLeaveBalance: { decrement: leave.days } } });
      } else if (leave.type === "SICK") {
        await db.user.update({ where: { id: leave.requesterId }, data: { sickLeaveBalance: { decrement: leave.days } } });
      }
      await notify({
        userId: leave.requesterId,
        type: "LEAVE_APPROVED",
        title: "Leave request approved 🎉",
        body: `Your ${leave.type.toLowerCase()} leave (${leave.days} days) is approved.`,
        link: "/leave",
      });
    }

    await audit({ actorId: user.id, action: `leave.${action}`, entity: "leave", entityId: id, newValue: { outcome } });
    return NextResponse.json({ ok: true, outcome });
  } catch (e) {
    return toErrorResponse(e);
  }
}
