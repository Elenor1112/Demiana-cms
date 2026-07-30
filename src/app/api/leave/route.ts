import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse } from "@/lib/api";
import { requireFutureDateTime } from "@/lib/timezone";
import { buildApprovalChain, createApprovalSteps } from "@/lib/approvals";
import { businessDaysBetween } from "@/lib/utils";
import { notifyMany } from "@/lib/notify";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const scope = req.nextUrl.searchParams.get("scope"); // mine | all | pending
    const canViewAll = user.isSuperAdmin || user.permissions.includes("Leave.ViewAll") || user.permissions.includes("Leave.Approve");

    const where =
      scope === "all" && canViewAll ? {} : { requesterId: user.id };

    const requests = await db.leaveRequest.findMany({
      where,
      include: {
        requester: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
        actingUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ requests });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const schema = z.object({
  type: z.enum(["ANNUAL", "SICK", "EMERGENCY", "PERSONAL", "UNPAID", "OTHER"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().min(3),
  actingUserId: z.string().optional().nullable(),
  handover: z.string().optional().nullable(),
  declaration: z.boolean(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const data = schema.parse(await req.json());
    const start = requireFutureDateTime(data.startDate, "startDate");
    const end = requireFutureDateTime(data.endDate, "endDate");

    // ── Handbook validations ──
    const errors: string[] = [];
    const warnings: string[] = [];

    if (end < start) errors.push("End date cannot be before start date.");
    if (!data.declaration) errors.push("You must accept the declaration.");
    // acting employee + handover required (per handbook)
    if (!data.actingUserId) errors.push("An acting employee is required.");
    if (!data.handover || data.handover.trim().length < 3) errors.push("A work handover note is required.");

    const days = businessDaysBetween(start, end);

    // leave balance check
    const dbUser = await db.user.findUnique({ where: { id: user.id } });
    if (data.type === "ANNUAL" && dbUser && days > dbUser.annualLeaveBalance) {
      errors.push(`Insufficient annual leave balance (${dbUser.annualLeaveBalance} days left, requested ${days}).`);
    }
    if (data.type === "SICK" && dbUser && days > dbUser.sickLeaveBalance) {
      warnings.push(`Requested sick days (${days}) exceed your balance (${dbUser.sickLeaveBalance}).`);
    }

    // overlap detection
    const overlap = await db.leaveRequest.findFirst({
      where: {
        requesterId: user.id,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
    });
    if (overlap) errors.push("You already have a leave request overlapping these dates.");

    // active tasks warning
    const activeTasks = await db.task.count({
      where: { assignees: { some: { userId: user.id } }, status: { in: ["TODO", "IN_PROGRESS", "WAITING_APPROVAL"] } },
    });
    if (activeTasks > 0) warnings.push(`You have ${activeTasks} active task(s). Ensure they are handed over.`);

    if (errors.length) {
      return NextResponse.json({ error: errors[0], errors, warnings }, { status: 422 });
    }

    const returnDate = new Date(end);
    returnDate.setDate(returnDate.getDate() + 1);

    const leave = await db.leaveRequest.create({
      data: {
        requesterId: user.id,
        type: data.type,
        startDate: start,
        endDate: end,
        days,
        returnDate,
        reason: data.reason,
        actingUserId: data.actingUserId || null,
        handover: data.handover,
        declaration: data.declaration,
        status: "PENDING",
      },
    });

    // build & persist approval chain
    const chain = await buildApprovalChain(user.id);
    if (chain.length === 0) {
      // no approvers (e.g. CEO) → auto approve
      await db.leaveRequest.update({ where: { id: leave.id }, data: { status: "APPROVED" } });
    } else {
      await createApprovalSteps("LEAVE", leave.id, chain);
    }

    // notify acting user
    if (data.actingUserId) {
      await notifyMany([data.actingUserId], {
        type: "ANNOUNCEMENT",
        title: "You're set as acting employee",
        body: `${user.firstName} requested leave and named you to cover their work.`,
        link: "/leave",
      });
    }

    await audit({ actorId: user.id, action: "leave.create", entity: "leave", entityId: leave.id, newValue: { type: data.type, days } });

    return NextResponse.json({ request: leave, warnings }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
