import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { canViewJobDescriptionOf } from "@/lib/rbac";
import { readFile } from "@/lib/job-descriptions";

/**
 * Stream a job description PDF.
 *
 * The document is served through the app rather than from a public URL so that
 * every read is authorized against the same scope rules as the rest of the
 * module — there is no unguarded link that could be forwarded outside the
 * company. `?download=1` switches the disposition to attachment; the default is
 * `inline`, which is what the embedded viewer needs.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  try {
    const user = await requireUser();
    const { versionId } = await params;

    const version = await db.jobDescriptionVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        checksum: true,
        document: {
          select: {
            employeeId: true,
            employee: { select: { id: true, departmentId: true } },
          },
        },
      },
    });
    if (!version) throw new ApiError(404, "Document not found");

    if (!canViewJobDescriptionOf(user, version.document.employee)) {
      throw new ApiError(403, "You do not have access to this job description");
    }

    // The browser revalidates with If-None-Match; versions are immutable, so a
    // match is always safe to serve from cache.
    if (req.headers.get("if-none-match") === `"${version.checksum}"`) {
      return new NextResponse(null, { status: 304 });
    }

    const data = await readFile(version.id);
    if (!data) throw new ApiError(404, "Document file is missing");

    const download = req.nextUrl.searchParams.get("download") === "1";
    // Quotes and non-ASCII in a filename would break the header, so send an
    // ASCII fallback plus the RFC 5987 encoded form.
    const asciiName = version.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": version.mimeType,
        "Content-Length": String(data.byteLength),
        "Content-Disposition":
          `${download ? "attachment" : "inline"}; filename="${asciiName}"; ` +
          `filename*=UTF-8''${encodeURIComponent(version.fileName)}`,
        // Private: this is per-user authorized content and must never be held
        // by a shared cache or CDN.
        "Cache-Control": "private, max-age=0, must-revalidate",
        ETag: `"${version.checksum}"`,
        "X-Content-Type-Options": "nosniff",
        // A PDF is passive content, but it is still user-supplied — deny it any
        // ability to frame or script against the app's own origin.
        "Content-Security-Policy": "default-src 'none'; object-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
