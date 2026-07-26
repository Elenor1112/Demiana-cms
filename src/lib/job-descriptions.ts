import "server-only";
import { createHash } from "crypto";
import { db } from "./db";
import { ApiError } from "./api";
import type { Prisma } from "@prisma/client";

/**
 * Job description document handling.
 *
 * Storage lives in Postgres (`JobDescriptionFile.data`) rather than an object
 * store: the platform has no bucket provisioned, and Vercel's filesystem is
 * read-only, so bytes in the database are the only option that works today.
 * Every read and write of the payload goes through this module, so swapping in
 * S3/R2 later means reimplementing `readFile`/`writeFile` here and nothing else.
 */

/** PDFs only — the acknowledgment flow renders them in an embedded viewer. */
export const ALLOWED_MIME = "application/pdf";
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Metadata selection that deliberately never touches the blob. */
export const versionSelect = {
  id: true,
  version: true,
  fileName: true,
  mimeType: true,
  size: true,
  checksum: true,
  changeNote: true,
  createdAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.JobDescriptionVersionSelect;

export const documentSelect = {
  id: true,
  title: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true,
  currentVersionId: true,
  currentVersion: { select: versionSelect },
} satisfies Prisma.JobDescriptionSelect;

export function sha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Validate an uploaded file before any of it reaches the database.
 *
 * The declared MIME type is attacker-controlled, so the magic bytes are checked
 * too — a renamed .exe must not be accepted just because the browser labelled
 * the part `application/pdf`.
 */
export function assertValidPdf(file: {
  name: string;
  type: string;
  size: number;
  bytes: Buffer;
}) {
  if (file.size <= 0) throw new ApiError(400, "The uploaded file is empty");
  if (file.size > MAX_FILE_BYTES) {
    throw new ApiError(
      413,
      `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${
        MAX_FILE_BYTES / 1024 / 1024
      } MB.`
    );
  }
  if (file.type !== ALLOWED_MIME) {
    throw new ApiError(415, "Only PDF files are accepted");
  }
  // %PDF- header. Nothing else is a PDF, whatever the part claims.
  if (file.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new ApiError(415, "That file is not a valid PDF");
  }
}

/** Strip any path components a browser may have included, and cap the length. */
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop()?.trim() || "job-description.pdf";
  return base.slice(0, 200);
}

/**
 * Read a multipart form field as a validated PDF buffer.
 * Returns null when the field is absent, so callers can treat "no file" and
 * "bad file" differently.
 */
export async function readPdfField(form: FormData, field: string) {
  const value = form.get(field);
  if (!value || typeof value === "string") return null;

  const file = value as File;
  const bytes = Buffer.from(await file.arrayBuffer());
  // Trust the buffer's length over the reported size — the two can disagree.
  assertValidPdf({ name: file.name, type: file.type, size: bytes.byteLength, bytes });

  return {
    fileName: safeFileName(file.name),
    mimeType: ALLOWED_MIME,
    size: bytes.byteLength,
    checksum: sha256(bytes),
    bytes,
  };
}

export type UploadedPdf = NonNullable<Awaited<ReturnType<typeof readPdfField>>>;

/**
 * Attach a new job description version to an employee, creating the document
 * on first upload.
 *
 * Runs as one transaction: appending the version, storing the blob and moving
 * the document's `currentVersionId` pointer must not be observable apart, or a
 * concurrent reader could see a document whose current version has no file.
 * The version number is derived inside the transaction and protected by the
 * `@@unique([documentId, version])` constraint, so two simultaneous uploads
 * cannot both claim v3 — the loser fails and is retried by the caller.
 */
export async function addJobDescriptionVersion(opts: {
  employeeId: string;
  title?: string;
  changeNote?: string | null;
  uploadedById: string;
  file: UploadedPdf;
}) {
  const { employeeId, uploadedById, file } = opts;

  return db.$transaction(async (tx) => {
    const existing = await tx.jobDescription.findUnique({
      where: { employeeId },
      select: { id: true, title: true },
    });

    const document =
      existing ??
      (await tx.jobDescription.create({
        data: {
          employeeId,
          title: opts.title?.trim() || "Job Description",
        },
        select: { id: true, title: true },
      }));

    const last = await tx.jobDescriptionVersion.findFirst({
      where: { documentId: document.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    const version = await tx.jobDescriptionVersion.create({
      data: {
        documentId: document.id,
        version: nextVersion,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        checksum: file.checksum,
        changeNote: opts.changeNote?.trim() || null,
        uploadedById,
        file: { create: { data: file.bytes } },
      },
      select: versionSelect,
    });

    const updated = await tx.jobDescription.update({
      where: { id: document.id },
      data: {
        currentVersionId: version.id,
        // Only rename on an explicit title, so a plain re-upload keeps the
        // name HR already chose.
        ...(opts.title?.trim() ? { title: opts.title.trim() } : {}),
      },
      select: documentSelect,
    });

    return { document: updated, version };
  });
}

/**
 * Load the stored bytes for a version. Isolated so the blob column is read in
 * exactly one place in the codebase.
 */
export async function readFile(versionId: string) {
  const row = await db.jobDescriptionFile.findUnique({
    where: { versionId },
    select: { data: true },
  });
  return row?.data ? Buffer.from(row.data) : null;
}

/**
 * Resolve which employees a viewer is allowed to see, as a Prisma `where`
 * fragment on User. Kept next to the scope helper's consumers so list and
 * detail routes filter identically.
 */
export function employeeScopeWhere(
  scope: { kind: "all" } | { kind: "department"; departmentId: string } | { kind: "self" },
  viewerId: string
): Prisma.UserWhereInput {
  if (scope.kind === "all") return {};
  if (scope.kind === "department") {
    // Managers see their department, and always their own record even if they
    // sit outside it.
    return { OR: [{ departmentId: scope.departmentId }, { id: viewerId }] };
  }
  return { id: viewerId };
}
