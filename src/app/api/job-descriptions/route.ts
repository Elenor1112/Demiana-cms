import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { can, jobDescriptionScope } from "@/lib/rbac";
import { documentSelect, employeeScopeWhere } from "@/lib/job-descriptions";

/**
 * The Job Description tab's data source.
 *
 * Returns two things, both scoped to what the caller may see:
 *   `mine`  — the caller's own document + whether they still owe an ack.
 *   `roster`— acknowledgment status across employees, for admins/managers.
 * Employees without the acknowledgment permission get `roster: null` rather
 * than an empty list, so the UI can tell "nothing to show" from "not for you".
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = req.nextUrl;

    // ─── The caller's own document ───
    const mineDoc = can(user, "JobDescription.ViewOwn")
      ? await db.jobDescription.findUnique({
          where: { employeeId: user.id },
          select: documentSelect,
        })
      : null;

    let mine = null;
    if (mineDoc) {
      const ack = mineDoc.currentVersionId
        ? await db.jobDescriptionAck.findUnique({
            where: {
              versionId_userId: { versionId: mineDoc.currentVersionId, userId: user.id },
            },
            select: { ackedAt: true },
          })
        : null;

      const history = await db.jobDescriptionVersion.findMany({
        where: { documentId: mineDoc.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, fileName: true, createdAt: true },
      });

      mine = {
        ...mineDoc,
        acknowledged: Boolean(ack),
        acknowledgedAt: ack?.ackedAt ?? null,
        versionCount: history.length,
        history,
      };
    }

    // ─── Admin / manager roster ───
    let roster = null;
    if (can(user, "JobDescription.ViewAcknowledgments")) {
      const scope = jobDescriptionScope(user);
      const department = searchParams.get("department");
      const status = searchParams.get("status"); // acknowledged | pending | missing
      const q = searchParams.get("q")?.trim();
      const employeeId = searchParams.get("employee");

      const employees = await db.user.findMany({
        where: {
          AND: [
            employeeScopeWhere(scope, user.id),
            { status: { not: "DEACTIVATED" } },
            department ? { departmentId: department } : {},
            employeeId ? { id: employeeId } : {},
            q
              ? {
                  OR: [
                    { firstName: { contains: q, mode: "insensitive" } },
                    { lastName: { contains: q, mode: "insensitive" } },
                    { email: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {},
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          avatarUrl: true,
          jobTitle: true,
          department: { select: { id: true, name: true, color: true } },
          role: { select: { name: true } },
          jobDescription: { select: documentSelect },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });

      // One query for every relevant ack rather than one per employee.
      const currentVersionIds = employees
        .map((e) => e.jobDescription?.currentVersionId)
        .filter((id): id is string => Boolean(id));

      const acks = currentVersionIds.length
        ? await db.jobDescriptionAck.findMany({
            where: { versionId: { in: currentVersionIds } },
            select: { versionId: true, userId: true, ackedAt: true },
          })
        : [];
      const ackBy = new Map(acks.map((a) => [`${a.versionId}:${a.userId}`, a.ackedAt]));

      const rows = employees.map((e) => {
        const doc = e.jobDescription;
        const ackedAt = doc?.currentVersionId
          ? ackBy.get(`${doc.currentVersionId}:${e.id}`) ?? null
          : null;
        return {
          employee: {
            id: e.id,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email,
            avatarUrl: e.avatarUrl,
            jobTitle: e.jobTitle,
            department: e.department,
            role: e.role,
          },
          document: doc ?? null,
          // "missing" is a distinct state from "pending": nobody has uploaded
          // a document at all, so the employee has nothing to acknowledge.
          status: !doc?.currentVersionId ? "missing" : ackedAt ? "acknowledged" : "pending",
          acknowledgedAt: ackedAt,
        };
      });

      const filtered = status ? rows.filter((r) => r.status === status) : rows;

      roster = {
        rows: filtered,
        stats: {
          total: rows.length,
          acknowledged: rows.filter((r) => r.status === "acknowledged").length,
          pending: rows.filter((r) => r.status === "pending").length,
          missing: rows.filter((r) => r.status === "missing").length,
        },
      };
    }

    return NextResponse.json({
      mine,
      roster,
      canUpload: can(user, "JobDescription.Upload"),
      canViewAcknowledgments: can(user, "JobDescription.ViewAcknowledgments"),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
