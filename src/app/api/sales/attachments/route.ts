import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { leadVisibilityFilter, assertCanEditLead, logSalesActivity, SALES_ACTIVITY, requireSalesModule } from "@/lib/sales";

/**
 * Upload a file or voice note against a sales object.
 *
 * Payloads are stored as bytes in SalesAttachmentFile, mirroring
 * JobDescriptionFile — the platform deliberately has no external object store,
 * so this keeps uploads working with nothing else to configure.
 */

/** Generous enough for a deck or a voice note, small enough to protect the DB. */
const MAX_BYTES = 10 * 1024 * 1024;

/** Exactly one of these identifies the parent. */
const PARENTS = ["leadId", "meetingId", "briefId", "feedbackId", "proposalId"] as const;
type ParentKey = (typeof PARENTS)[number];

export async function POST(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const form = await req.formData();

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded.");
    if (file.size === 0) throw new ApiError(400, "The uploaded file is empty.");
    if (file.size > MAX_BYTES) {
      throw new ApiError(413, `Files must be ${MAX_BYTES / 1024 / 1024}MB or smaller.`);
    }

    const present = PARENTS.filter((k) => typeof form.get(k) === "string" && form.get(k));
    if (present.length !== 1) {
      throw new ApiError(400, "Provide exactly one parent id for the attachment.");
    }
    const parentKey = present[0] as ParentKey;
    const parentId = form.get(parentKey) as string;
    const isVoiceNote = form.get("isVoiceNote") === "1";

    // Resolve the owning lead so permissions are checked against ONE rule, no
    // matter which of the five objects the file is being attached to.
    const leadId = await resolveLeadId(parentKey, parentId);
    const lead = await db.lead.findFirst({
      where: { id: leadId, ...leadVisibilityFilter(user) },
      select: { id: true, code: true, companyName: true, ownerId: true, createdById: true },
    });
    if (!lead) throw new ApiError(404, "The item this file belongs to was not found.");
    assertCanEditLead(user, lead, "Sales.LeadEdit");

    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");

    const attachment = await db.salesAttachment.create({
      data: {
        [parentKey]: parentId,
        name: file.name || (isVoiceNote ? "Voice note" : "Attachment"),
        mimeType: file.type || "application/octet-stream",
        size: bytes.byteLength,
        checksum,
        isVoiceNote,
        uploadedById: user.id,
        file: { create: { data: bytes } },
      },
      select: {
        id: true, name: true, mimeType: true, size: true, isVoiceNote: true, createdAt: true,
        uploadedBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    await logSalesActivity({
      leadId, actorId: user.id, verb: SALES_ACTIVITY.FILE_UPLOADED,
      summary: attachment.name, meta: { attachmentId: attachment.id, parent: parentKey },
    });
    await audit({
      actorId: user.id, action: "sales.attachment.create", entity: "salesAttachment",
      entityId: attachment.id,
      newValue: { name: attachment.name, size: attachment.size, [parentKey]: parentId },
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Which lead an attachment ultimately belongs to.
 *
 * Every sales object hangs off a lead, so this collapses the five parent types
 * down to the single permission check above.
 */
async function resolveLeadId(parentKey: ParentKey, parentId: string): Promise<string> {
  switch (parentKey) {
    case "leadId":
      return parentId;
    case "meetingId": {
      const row = await db.salesMeeting.findUnique({ where: { id: parentId }, select: { leadId: true } });
      if (!row) throw new ApiError(404, "Meeting not found.");
      return row.leadId;
    }
    case "briefId": {
      const row = await db.discoveryBrief.findUnique({ where: { id: parentId }, select: { leadId: true } });
      if (!row) throw new ApiError(404, "Discovery brief not found.");
      return row.leadId;
    }
    case "feedbackId": {
      const row = await db.salesFeedback.findUnique({ where: { id: parentId }, select: { leadId: true } });
      if (!row) throw new ApiError(404, "Feedback not found.");
      return row.leadId;
    }
    case "proposalId": {
      const row = await db.proposal.findUnique({ where: { id: parentId }, select: { leadId: true } });
      if (!row) throw new ApiError(404, "Proposal not found.");
      return row.leadId;
    }
  }
}
