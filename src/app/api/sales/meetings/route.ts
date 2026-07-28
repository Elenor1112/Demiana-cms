import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { requireUserDateTime, zonedParts } from "@/lib/timezone";
import {
  leadVisibilityFilter, assertCanEditLead, logSalesActivity, SALES_ACTIVITY,
  notifySales, MEETING_REQUIREMENTS, requireSalesModule,
} from "@/lib/sales";
import { meetingCreateSchema } from "@/lib/sales-schemas";
import type { MeetingStatus, Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    const sp = req.nextUrl.searchParams;

    const status = sp.getAll("status").filter(Boolean) as MeetingStatus[];
    const leadId = sp.get("lead");
    const range = sp.get("range"); // today | upcoming | past
    const q = sp.get("q")?.trim();

    // Meetings inherit the lead's visibility rather than carrying their own —
    // one rule, enforced by nesting the filter under `lead`.
    const and: Prisma.SalesMeetingWhereInput[] = [];
    if (visibility) and.push({ lead: visibility });
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { lead: { companyName: { contains: q, mode: "insensitive" } } },
        ],
      });
    }

    const now = new Date();
    if (range === "today") {
      // Day boundaries in the COMPANY zone, not the server's — the same
      // correction the analytics route documents.
      const p = zonedParts(now);
      const dayStart = requireUserDateTime(
        `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
        "dayStart"
      );
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      and.push({ scheduledAt: { gte: dayStart, lt: dayEnd } });
    } else if (range === "upcoming") {
      and.push({ scheduledAt: { gte: now } });
    } else if (range === "past") {
      and.push({ scheduledAt: { lt: now } });
    }

    const meetings = await db.salesMeeting.findMany({
      where: {
        ...(and.length ? { AND: and } : {}),
        ...(status.length ? { status: { in: status } } : {}),
        ...(leadId ? { leadId } : {}),
      },
      include: {
        lead: { select: { id: true, code: true, companyName: true, stage: true } },
        organizer: userPick,
        attendees: { include: { user: userPick } },
        requirements: { orderBy: { order: "asc" } },
        _count: { select: { feedback: true, attachments: true } },
      },
      orderBy: { scheduledAt: range === "past" ? "desc" : "asc" },
      take: 300,
    });

    return NextResponse.json({ meetings });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const data = meetingCreateSchema.parse(await req.json());

    const lead = await db.lead.findFirst({
      where: { id: data.leadId, ...leadVisibilityFilter(user) },
      select: { id: true, code: true, companyName: true, ownerId: true, createdById: true, stage: true },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");
    assertCanEditLead(user, lead, "Sales.MeetingManage");

    // Wall-clock text resolved against APP_TIMEZONE; never `new Date(string)`,
    // which would adopt the server's zone and shift the meeting on Vercel.
    const scheduledAt = requireUserDateTime(data.scheduledAt, "scheduledAt");

    const meeting = await db.salesMeeting.create({
      data: {
        leadId: lead.id,
        title: data.title,
        type: data.type,
        locationType: data.locationType,
        location: data.location,
        meetingLink: data.meetingLink,
        scheduledAt,
        durationMinutes: data.durationMinutes,
        agenda: data.agenda,
        preparationNotes: data.preparationNotes,
        organizerId: user.id,
        attendees: {
          create: [...new Set([user.id, ...data.attendeeIds])].map((userId) => ({ userId })),
        },
        // Seed the readiness checklist from the fixed catalog so completion
        // rates stay comparable between meetings.
        requirements: {
          create: MEETING_REQUIREMENTS.map((r, i) => ({ key: r.key, label: r.label, order: i })),
        },
      },
      include: {
        lead: { select: { id: true, code: true, companyName: true } },
        organizer: userPick,
        attendees: { include: { user: userPick } },
        requirements: { orderBy: { order: "asc" } },
      },
    });

    // Booking a meeting moves an early-stage lead forward on its own — the
    // salesperson should not have to remember to also drag the card.
    if (lead.stage === "NEW" || lead.stage === "CONTACTED") {
      await db.lead.update({ where: { id: lead.id }, data: { stage: "MEETING_SCHEDULED" } });
      await db.leadStageChange.create({
        data: { leadId: lead.id, fromStage: lead.stage, toStage: "MEETING_SCHEDULED", actorId: user.id },
      });
    }

    await logSalesActivity({
      leadId: lead.id, actorId: user.id, verb: SALES_ACTIVITY.MEETING_SCHEDULED,
      summary: `${data.title} scheduled`,
      meta: { meetingId: meeting.id, scheduledAt: scheduledAt.toISOString() },
    });

    await audit({
      actorId: user.id, action: "sales.meeting.create", entity: "meeting", entityId: meeting.id,
      newValue: { leadId: lead.id, title: data.title, scheduledAt: scheduledAt.toISOString() },
    });

    const invitees = [...new Set(data.attendeeIds)].filter((uid) => uid !== user.id);
    if (invitees.length) {
      const { notifyMany } = await import("@/lib/notify");
      await notifyMany(invitees, {
        type: "DEADLINE_REMINDER",
        title: `Meeting: ${data.title}`,
        body: `${lead.companyName} — you have been added to a meeting by ${user.firstName} ${user.lastName}.`,
        link: `/sales/meetings?meeting=${meeting.id}`,
        meta: { meetingId: meeting.id, leadId: lead.id },
      });
    }
    if (lead.ownerId && lead.ownerId !== user.id && !invitees.includes(lead.ownerId)) {
      await notifySales({
        ownerId: lead.ownerId, excludeActorId: user.id, includeManagers: false,
        type: "PROJECT_UPDATED",
        title: `Meeting scheduled for ${lead.companyName}`,
        body: `${data.title}`,
        link: `/sales/leads/${lead.id}`,
        meta: { meetingId: meeting.id, leadId: lead.id },
      });
    }

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
