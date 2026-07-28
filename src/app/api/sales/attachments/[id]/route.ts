import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { leadVisibilityFilter, assertCanEditLead, requireSalesModule } from "@/lib/sales";
import type { SessionUser } from "@/lib/rbac";

/**
 * Serve or delete one sales attachment.
 *
 * Like job description files, the payload is served THROUGH the app rather than
 * from a public URL, so every read is authorized against the same lead scope as
 * the rest of the workspace and there is no forwardable unguarded link.
 */

/** The attachment plus the id of the lead that ultimately owns it. */
async function loadAttachment(id: string) {
  const row = await db.salesAttachment.findUnique({
    where: { id },
    select: {
      id: true, name: true, mimeType: true, size: true, checksum: true, isVoiceNote: true,
      leadId: true,
      meeting: { select: { leadId: true } },
      brief: { select: { leadId: true } },
      feedback: { select: { leadId: true } },
      proposal: { select: { leadId: true } },
    },
  });
  if (!row) throw new ApiError(404, "Attachment not found.");
  const leadId =
    row.leadId ?? row.meeting?.leadId ?? row.brief?.leadId ??
    row.feedback?.leadId ?? row.proposal?.leadId;
  // Unreachable while the sales_attachment_one_parent constraint holds; treated
  // as not-found rather than crashing if it somehow does not.
  if (!leadId) throw new ApiError(404, "Attachment is not linked to a lead.");
  return { ...row, leadId };
}

/** The lead behind an attachment, if this user is allowed to see it. */
async function requireVisibleParent(user: SessionUser, leadId: string) {
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...leadVisibilityFilter(user) },
    select: { id: true, ownerId: true, createdById: true },
  });
  if (!lead) throw new ApiError(404, "Attachment not found.");
  return lead;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const attachment = await loadAttachment(id);
    await requireVisibleParent(user, attachment.leadId);

    // Attachments are immutable once uploaded (a replacement is a new row), so
    // an ETag match is always safe to serve from cache.
    if (req.headers.get("if-none-match") === `"${attachment.checksum}"`) {
      return new NextResponse(null, { status: 304 });
    }

    const payload = await db.salesAttachmentFile.findUnique({
      where: { attachmentId: id },
      select: { data: true },
    });
    if (!payload) throw new ApiError(404, "Attachment file is missing.");

    const download = req.nextUrl.searchParams.get("download") === "1";
    // Quotes and non-ASCII would break the header, so send an ASCII fallback
    // alongside the RFC 5987 encoded form.
    const asciiName = attachment.name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

    return new NextResponse(new Uint8Array(payload.data), {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(payload.data.byteLength),
        "Content-Disposition":
          `${download ? "attachment" : "inline"}; filename="${asciiName}"; ` +
          `filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        // Private: per-user authorized content, never held by a shared cache.
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: `"${attachment.checksum}"`,
        "X-Content-Type-Options": "nosniff",
        // User-supplied content: deny it any ability to frame or script against
        // the app's own origin.
        "Content-Security-Policy": "default-src 'none'; object-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = requireSalesModule(await requireUser());
    const { id } = await params;
    const attachment = await loadAttachment(id);
    const lead = await requireVisibleParent(user, attachment.leadId);
    assertCanEditLead(user, lead, "Sales.LeadEdit");

    // The blob row cascades with the metadata row.
    await db.salesAttachment.delete({ where: { id } });

    await audit({
      actorId: user.id, action: "sales.attachment.delete", entity: "salesAttachment", entityId: id,
      oldValue: { name: attachment.name, leadId: attachment.leadId },
    });

    return NextResponse.json({ ok: true, message: "Attachment deleted" });
  } catch (e) {
    return toErrorResponse(e);
  }
}
