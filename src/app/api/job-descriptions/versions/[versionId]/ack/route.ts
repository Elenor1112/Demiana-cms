import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";

/**
 * Acknowledge a job description version.
 *
 * Mirrors `/api/policies/:id/ack`, with two differences the policy flow does
 * not need: acknowledgment is only ever self-service (nobody can acknowledge on
 * another employee's behalf), and it is refused for superseded versions so the
 * record always means "I read what is current".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  try {
    const user = await requireUser();
    const { versionId } = await params;

    if (!can(user, "JobDescription.ViewOwn")) {
      throw new ApiError(403, "You cannot acknowledge job descriptions");
    }

    const version = await db.jobDescriptionVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        version: true,
        document: { select: { id: true, employeeId: true, currentVersionId: true } },
      },
    });
    if (!version) throw new ApiError(404, "Job description not found");

    // Self-service only — an acknowledgment signed by anyone other than the
    // employee it belongs to would be worthless as a record.
    if (version.document.employeeId !== user.id) {
      throw new ApiError(403, "You can only acknowledge your own job description");
    }

    if (version.document.currentVersionId !== version.id) {
      throw new ApiError(
        409,
        "A newer version of your job description has been published. Please review the current version."
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      undefined;
    const userAgent = req.headers.get("user-agent") ?? undefined;

    // Upsert keeps a double-submit idempotent instead of throwing on the
    // unique constraint; the original timestamp is preserved.
    const ack = await db.jobDescriptionAck.upsert({
      where: { versionId_userId: { versionId: version.id, userId: user.id } },
      update: {},
      create: { versionId: version.id, userId: user.id, ip, userAgent },
      select: { id: true, ackedAt: true },
    });

    await audit({
      actorId: user.id,
      action: "jobDescription.acknowledge",
      entity: "jobDescription",
      entityId: version.document.id,
      newValue: { versionId: version.id, version: version.version },
      ip,
      device: userAgent,
    });

    return NextResponse.json({ ok: true, acknowledgedAt: ack.ackedAt });
  } catch (e) {
    return toErrorResponse(e);
  }
}
