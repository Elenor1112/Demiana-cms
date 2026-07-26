import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse, ApiError } from "@/lib/api";
import { canViewJobDescriptionOf } from "@/lib/rbac";
import { notify } from "@/lib/notify";
import {
  addJobDescriptionVersion,
  documentSelect,
  readPdfField,
  versionSelect,
} from "@/lib/job-descriptions";

/** The employee whose document is being addressed, or 404. */
async function loadEmployee(id: string) {
  const employee = await db.user.findUnique({
    where: { id },
    select: { id: true, firstName: true, lastName: true, departmentId: true },
  });
  if (!employee) throw new ApiError(404, "Employee not found");
  return employee;
}

/** The employee's document with full version history. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const employee = await loadEmployee(id);

    if (!canViewJobDescriptionOf(user, employee)) {
      throw new ApiError(403, "You do not have access to this job description");
    }

    const document = await db.jobDescription.findUnique({
      where: { employeeId: id },
      select: {
        ...documentSelect,
        versions: { orderBy: { version: "desc" }, select: versionSelect },
      },
    });

    if (!document) return NextResponse.json({ document: null });

    const ack = document.currentVersionId
      ? await db.jobDescriptionAck.findUnique({
          where: { versionId_userId: { versionId: document.currentVersionId, userId: id } },
          select: { ackedAt: true },
        })
      : null;

    return NextResponse.json({
      document,
      acknowledged: Boolean(ack),
      acknowledgedAt: ack?.ackedAt ?? null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Upload or replace an employee's job description.
 *
 * Always additive: a replacement appends a version and re-points the document,
 * so previous acknowledgments remain attached to the version they were made
 * against and the employee is asked to acknowledge the new revision.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("JobDescription.Upload");
    const { id } = await params;
    const employee = await loadEmployee(id);

    const form = await req.formData();
    const file = await readPdfField(form, "file");
    if (!file) throw new ApiError(400, "A PDF file is required");

    const titleField = form.get("title");
    const noteField = form.get("changeNote");

    const { document, version } = await addJobDescriptionVersion({
      employeeId: employee.id,
      title: typeof titleField === "string" ? titleField : undefined,
      changeNote: typeof noteField === "string" ? noteField : null,
      uploadedById: actor.id,
      file,
    });

    await audit({
      actorId: actor.id,
      action: version.version === 1 ? "jobDescription.upload" : "jobDescription.replace",
      entity: "jobDescription",
      entityId: document.id,
      newValue: {
        employeeId: employee.id,
        version: version.version,
        fileName: version.fileName,
        size: version.size,
        checksum: version.checksum,
      },
    });

    // Tell the employee there is something new to read. Never let a
    // notification failure roll back a successful upload.
    if (employee.id !== actor.id) {
      await notify({
        userId: employee.id,
        type: "ANNOUNCEMENT",
        title:
          version.version === 1
            ? "Your job description is available"
            : "Your job description has been updated",
        body: "Please read and acknowledge it.",
        link: "/job-description",
        meta: { documentId: document.id, version: version.version },
      }).catch((e) => console.error("[job-description] notify failed", e));
    }

    return NextResponse.json({ document, version }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/**
 * Remove an employee's job description entirely.
 *
 * Cascades to versions, stored files and acknowledgments — this is the
 * "unassign" action, not a version rollback. Replacing a document should go
 * through POST instead, which preserves history.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("JobDescription.Delete");
    const { id } = await params;

    const document = await db.jobDescription.findUnique({
      where: { employeeId: id },
      select: { id: true, title: true, _count: { select: { versions: true } } },
    });
    if (!document) throw new ApiError(404, "This employee has no job description");

    // The pointer must be cleared before the row can go, or the FK from
    // JobDescription.currentVersionId blocks the cascade. Both statements run
    // in one transaction: a failure between them would otherwise strand the
    // document with no current version, which reads to the employee as
    // "unassigned" while every version is still on file.
    await db.$transaction([
      db.jobDescription.update({
        where: { id: document.id },
        data: { currentVersionId: null },
      }),
      db.jobDescription.delete({ where: { id: document.id } }),
    ]);

    await audit({
      actorId: actor.id,
      action: "jobDescription.delete",
      entity: "jobDescription",
      entityId: document.id,
      oldValue: {
        employeeId: id,
        title: document.title,
        versions: document._count.versions,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
