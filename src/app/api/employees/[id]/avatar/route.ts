import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { readAvatarField, saveAvatar, removeAvatar } from "@/lib/avatars";

/**
 * Anyone may change their own profile picture. Changing somebody else's is an
 * administrative act and needs Employee.Edit.
 */
async function requireAvatarAccess(targetId: string) {
  const user = await requireUser();
  if (user.id === targetId) return user;
  if (!can(user, "Employee.Edit")) {
    throw new ApiError(403, "You can only change your own profile picture");
  }
  return user;
}

/** Serve the stored image. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Avatars are visible to any signed-in colleague — the same reach as the
    // employee directory itself.
    await requireUser();
    const { id } = await params;

    const avatar = await db.userAvatar.findUnique({ where: { userId: id } });
    if (!avatar) throw new ApiError(404, "No profile picture");

    if (req.headers.get("if-none-match") === `"${avatar.checksum}"`) {
      return new NextResponse(null, { status: 304 });
    }

    return new NextResponse(new Uint8Array(avatar.data), {
      status: 200,
      headers: {
        "Content-Type": avatar.mimeType,
        "Content-Length": String(avatar.size),
        // The URL is checksum-stamped, so a given URL's bytes never change and
        // can be cached hard. Private: it is authorized per-user content.
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: `"${avatar.checksum}"`,
        "X-Content-Type-Options": "nosniff",
        // User-supplied bytes served from our own origin — deny them any
        // ability to script or frame against it.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Upload or replace a profile picture. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireAvatarAccess(id);

    const target = await db.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) throw new ApiError(404, "Employee not found");

    const form = await req.formData();
    const file = await readAvatarField(form, "avatar");
    if (!file) throw new ApiError(400, "No image was provided");

    const avatarUrl = await saveAvatar(id, file);

    await audit({
      actorId: actor.id,
      action: "employee.avatar_update",
      entity: "user",
      entityId: id,
      newValue: { mimeType: file.mimeType, size: file.size, self: actor.id === id },
    });

    return NextResponse.json({ avatarUrl });
  } catch (e) {
    return toErrorResponse(e);
  }
}

/** Remove the picture and fall back to initials. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const actor = await requireAvatarAccess(id);

    const exists = await db.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new ApiError(404, "Employee not found");

    await removeAvatar(id);
    await audit({
      actorId: actor.id,
      action: "employee.avatar_remove",
      entity: "user",
      entityId: id,
      newValue: { self: actor.id === id },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
