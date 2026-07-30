import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse } from "@/lib/api";
import { requireFutureDateTime } from "@/lib/timezone";
import { buildApprovalChain, createApprovalSteps } from "@/lib/approvals";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const scope = req.nextUrl.searchParams.get("scope");
    const canViewAll = user.isSuperAdmin || user.permissions.includes("Permission.Approve");
    const where = scope === "all" && canViewAll ? {} : { requesterId: user.id };

    const requests = await db.permissionRequest.findMany({
      where,
      include: { requester: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  type: z.enum(["LATE_ARRIVAL", "EARLY_LEAVE", "TEMPORARY_LEAVE", "MEDICAL_APPOINTMENT", "EMERGENCY", "OTHER"]),
  date: z.string(),
  fromTime: z.string().optional(),
  toTime: z.string().optional(),
  reason: z.string().min(3),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const data = schema.parse(await req.json());

    const request = await db.permissionRequest.create({
      data: {
        requesterId: user.id,
        type: data.type,
        date: requireFutureDateTime(data.date, "date"),
        fromTime: data.fromTime,
        toTime: data.toTime,
        reason: data.reason,
        status: "PENDING",
      },
    });

    const chain = await buildApprovalChain(user.id);
    if (chain.length === 0) {
      await db.permissionRequest.update({ where: { id: request.id }, data: { status: "APPROVED" } });
    } else {
      await createApprovalSteps("PERMISSION", request.id, chain);
    }

    await audit({ actorId: user.id, action: "permission.create", entity: "permission", entityId: request.id, newValue: { type: data.type } });
    return NextResponse.json({ request }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
