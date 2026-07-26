import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requirePermission, audit, toErrorResponse } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { can, ROLE_META } from "@/lib/rbac";
import { addJobDescriptionVersion, readPdfField } from "@/lib/job-descriptions";
import type { RoleKey } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q")?.trim();
    const dept = searchParams.get("department");
    const role = searchParams.get("role") as RoleKey | null;
    const status = searchParams.get("status");

    const employees = await db.user.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  { jobTitle: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          dept ? { departmentId: dept } : {},
          role ? { role: { key: role } } : {},
          status ? { status: status as never } : {},
        ],
      },
      include: {
        role: true,
        department: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { assignedTasks: true } },
      },
      orderBy: [{ role: { level: "asc" } }, { firstName: "asc" }],
    });

    return NextResponse.json({ employees });
  } catch (e) {
    return toErrorResponse(e);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  roleKey: z.string(),
  jobTitle: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  managerId: z.string().optional().nullable(),
  password: z.string().min(8),
});

/**
 * Create an employee.
 *
 * Accepts JSON, or multipart/form-data when a job description PDF is attached
 * to the creation form. The PDF is validated *before* the user row is written,
 * so a bad file fails the whole request rather than leaving behind an employee
 * with no document and a confusing half-success.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requirePermission("Employee.Create");

    const isMultipart = req.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("multipart/form-data");

    let body: unknown;
    let jobDescriptionFile = null;
    let jobDescriptionTitle: string | undefined;

    if (isMultipart) {
      const form = await req.formData();
      const payload = form.get("payload");
      body = typeof payload === "string" ? JSON.parse(payload) : {};

      jobDescriptionFile = await readPdfField(form, "jobDescription");
      if (jobDescriptionFile && !can(actor, "JobDescription.Upload")) {
        return NextResponse.json(
          { error: "Missing permission: JobDescription.Upload" },
          { status: 403 }
        );
      }
      const title = form.get("jobDescriptionTitle");
      jobDescriptionTitle = typeof title === "string" && title.trim() ? title : undefined;
    } else {
      body = await req.json();
    }

    const data = createSchema.parse(body);

    if (!(data.roleKey in ROLE_META)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const role = await db.role.findUnique({ where: { key: data.roleKey as RoleKey } });
    if (!role) return NextResponse.json({ error: "Role not found" }, { status: 400 });

    const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 });

    const user = await db.user.create({
      data: {
        email: data.email.toLowerCase(),
        firstName: data.firstName,
        lastName: data.lastName,
        jobTitle: data.jobTitle,
        roleId: role.id,
        departmentId: data.departmentId || null,
        managerId: data.managerId || null,
        passwordHash: await hashPassword(data.password),
        status: "ACTIVE",
      },
      include: { role: true, department: true },
    });

    await audit({
      actorId: actor.id,
      action: "employee.create",
      entity: "user",
      entityId: user.id,
      newValue: { email: user.email, role: data.roleKey },
    });

    // Attach the job description as v1 of the new employee's document. The file
    // was already validated above, so this only fails on infrastructure
    // problems — report it rather than failing the created account.
    if (jobDescriptionFile) {
      try {
        const { document, version } = await addJobDescriptionVersion({
          employeeId: user.id,
          title: jobDescriptionTitle,
          uploadedById: actor.id,
          file: jobDescriptionFile,
        });
        await audit({
          actorId: actor.id,
          action: "jobDescription.upload",
          entity: "jobDescription",
          entityId: document.id,
          newValue: {
            employeeId: user.id,
            version: version.version,
            fileName: version.fileName,
            size: version.size,
            checksum: version.checksum,
          },
        });
      } catch (err) {
        console.error("[employees] job description attach failed", err);
        return NextResponse.json(
          {
            employee: user,
            warning:
              "The employee was created, but their job description could not be saved. Please upload it from their profile.",
          },
          { status: 201 }
        );
      }
    }

    return NextResponse.json({ employee: user }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
