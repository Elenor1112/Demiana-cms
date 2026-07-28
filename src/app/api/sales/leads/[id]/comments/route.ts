import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { leadVisibilityFilter, logSalesActivity, SALES_ACTIVITY, notifySales } from "@/lib/sales";
import { commentSchema } from "@/lib/sales-schemas";
import { notifyMany } from "@/lib/notify";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    // Anyone who can SEE the lead can comment on it — discussion is not gated
    // behind edit rights, so Account Management can weigh in on a converted
    // account without being able to alter the record.
    const lead = await db.lead.findFirst({
      where: { id, ...leadVisibilityFilter(user) },
      select: { id: true, code: true, companyName: true, ownerId: true },
    });
    if (!lead) throw new ApiError(404, "Lead not found.");

    const data = commentSchema.parse(await req.json());

    const comment = await db.salesComment.create({
      data: { leadId: id, authorId: user.id, body: data.body, mentions: data.mentions },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });

    await logSalesActivity({
      leadId: id,
      actorId: user.id,
      verb: SALES_ACTIVITY.COMMENT_ADDED,
      summary: data.body.slice(0, 140),
    });

    await audit({
      actorId: user.id, action: "sales.comment.create", entity: "lead", entityId: id,
      newValue: { commentId: comment.id },
    });

    // Mentions notify directly; the owner gets the lower-signal COMMENT_ADDED.
    const mentioned = data.mentions.filter((m) => m !== user.id);
    if (mentioned.length) {
      await notifyMany(mentioned, {
        type: "MENTIONED",
        title: `${user.firstName} ${user.lastName} mentioned you`,
        body: `On ${lead.companyName} (${lead.code}): ${data.body.slice(0, 120)}`,
        link: `/sales/leads/${id}`,
        meta: { leadId: id },
      });
    }
    if (lead.ownerId && lead.ownerId !== user.id && !mentioned.includes(lead.ownerId)) {
      await notifySales({
        ownerId: lead.ownerId, excludeActorId: user.id, includeManagers: false,
        type: "COMMENT_ADDED",
        title: `New comment on ${lead.companyName}`,
        body: `${user.firstName} ${user.lastName}: ${data.body.slice(0, 120)}`,
        link: `/sales/leads/${id}`,
        meta: { leadId: id },
      });
    }

    return NextResponse.json({ comment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
