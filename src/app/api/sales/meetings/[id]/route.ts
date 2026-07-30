import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { keepOrRequireFuture } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, logSalesActivity, SALES_ACTIVITY, notifySales, requireSalesModule,
} from "@/lib/sales";
import { meetingPatchSchema, requirementPatchSchema } from "@/lib/sales-schemas";
import type { SessionUser } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/** Load a meeting the caller may see, or 404. Shared by every verb below. */
async function loadMeeting(user: SessionUser, id: string) {
  const meeting = await db.salesMeeting.findFirst({
    // Meetings have no visibility rule of their own; they inherit the lead's.
    where: { id, lead: leadVisibilityFilter(user) },
    include: {
      lead: {
        select: {
          id: true, code: true, companyName: true, ownerId: true, createdById: true, stage: true,
        },
      },
      organizer: userPick,
      attendees: { include: { user: userPick } },
      requirements: { orderBy: { order: "asc" } },
      _count: { select: { feedback: true } },
    },
  });
  if (!meeting) throw new ApiError(404, "Meeting not found.");
  return meeting;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const meeting = await loadMeeting(user, id);
    return NextResponse.json({ meeting });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const meeting = await loadMeeting(user, id);
    assertCanEditLead(user, meeting.lead, "Sales.MeetingManage");

    const body = meetingPatchSchema.parse(await req.json());
    const now = new Date();

    const data: Prisma.SalesMeetingUpdateInput = {};
    for (const key of ["title", "type", "locationType", "location", "meetingLink", "agenda", "preparationNotes", "outcome"] as const) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[key] = body[key];
    }
    if (body.durationMinutes !== undefined) data.durationMinutes = body.durationMinutes;
    if (body.scheduledAt !== undefined) {
      // Rescheduling must land today or later; leaving the existing time in
      // place is fine even for a meeting that has already happened, which is
      // what lets a past meeting still be marked completed or annotated.
      data.scheduledAt = keepOrRequireFuture(body.scheduledAt, meeting.scheduledAt, "scheduledAt");
    }

    const completing = body.status === "COMPLETED" && meeting.status !== "COMPLETED";
    if (completing) {
      // The rule from the brief: a meeting cannot be closed out until it has
      // been debriefed. Checked here rather than in the UI so the API is the
      // one that guarantees it.
      if (meeting._count.feedback === 0) {
        throw new ApiError(
          409,
          "Submit the sales feedback form before marking this meeting completed."
        );
      }
      data.completedAt = now;
    }
    if (body.status !== undefined) data.status = body.status;

    if (body.attendeeIds !== undefined) {
      // Replace the roster wholesale: the client always sends the full list, so
      // a diff would only add a way for the two to disagree.
      data.attendees = {
        deleteMany: {},
        create: [...new Set([meeting.organizerId, ...body.attendeeIds])].map((userId) => ({ userId })),
      };
    }

    const updated = await db.salesMeeting.update({
      where: { id },
      data,
      include: {
        lead: { select: { id: true, code: true, companyName: true } },
        organizer: userPick,
        attendees: { include: { user: userPick } },
        requirements: { orderBy: { order: "asc" } },
      },
    });

    const verb =
      completing ? SALES_ACTIVITY.MEETING_COMPLETED
      : body.status === "CANCELLED" ? SALES_ACTIVITY.MEETING_CANCELLED
      : SALES_ACTIVITY.MEETING_UPDATED;
    await logSalesActivity({
      leadId: meeting.leadId, actorId: user.id, verb,
      summary: updated.title, meta: { meetingId: id }, at: now,
    });

    await audit({
      actorId: user.id, action: "sales.meeting.update", entity: "meeting", entityId: id,
      oldValue: { status: meeting.status, scheduledAt: meeting.scheduledAt },
      newValue: { status: updated.status, scheduledAt: updated.scheduledAt },
    });

    if (completing) {
      await notifySales({
        ownerId: meeting.lead.ownerId, excludeActorId: user.id,
        type: "PROJECT_UPDATED",
        title: `Meeting completed — ${meeting.lead.companyName}`,
        body: `${updated.title} has been marked completed.`,
        link: `/sales/leads/${meeting.leadId}`,
        meta: { meetingId: id, leadId: meeting.leadId },
      });
    }

    return NextResponse.json({ meeting: updated });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Tick or untick one checklist item. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const meeting = await loadMeeting(user, id);
    assertCanEditLead(user, meeting.lead, "Sales.MeetingManage");

    const { key, done } = requirementPatchSchema.parse(await req.json());
    const requirement = meeting.requirements.find((r) => r.key === key);
    if (!requirement) throw new ApiError(400, "Unknown checklist item.");

    await db.meetingRequirement.update({ where: { id: requirement.id }, data: { done } });

    const requirements = await db.meetingRequirement.findMany({
      where: { meetingId: id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ requirements });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const meeting = await loadMeeting(user, id);
    assertCanEditLead(user, meeting.lead, "Sales.MeetingManage");

    await db.salesMeeting.delete({ where: { id } });
    await logSalesActivity({
      leadId: meeting.leadId, actorId: user.id, verb: SALES_ACTIVITY.MEETING_CANCELLED,
      summary: `${meeting.title} removed`,
    });
    await audit({
      actorId: user.id, action: "sales.meeting.delete", entity: "meeting", entityId: id,
      oldValue: { title: meeting.title, leadId: meeting.leadId },
    });

    return NextResponse.json({ ok: true, message: "Meeting deleted" });
  } catch (e) {
    return toErrorResponse(e);
  }
}
