import "server-only";
import { createHash } from "crypto";
import { db } from "./db";
import { ApiError } from "./api";

/**
 * Profile pictures.
 *
 * Stored as bytes in Postgres and served through an authorized route, matching
 * how job description files work — the app needs no external object store, and
 * there is no unguarded public URL.
 */

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

/** Magic bytes per accepted format. The declared MIME type is not trusted. */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", test: (b) => b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/gif", test: (b) => b.subarray(0, 6).toString("latin1").startsWith("GIF8") },
];

export const ACCEPTED_AVATAR_TYPES = SIGNATURES.map((s) => s.mime);

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Validate an uploaded avatar and return what to persist.
 *
 * The MIME type is derived from the file's own bytes, never from the part's
 * declared type — a caller could otherwise label an SVG or HTML payload as
 * image/png and have it served back from our origin.
 */
export async function readAvatarField(form: FormData, field: string) {
  const value = form.get(field);
  if (!value || typeof value === "string") return null;

  const file = value as File;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (bytes.byteLength === 0) throw new ApiError(400, "The uploaded image is empty");
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new ApiError(
      413,
      `Image is too large (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_AVATAR_BYTES / 1024 / 1024} MB.`
    );
  }

  const match = SIGNATURES.find((s) => s.test(bytes));
  if (!match) {
    throw new ApiError(415, "Only PNG, JPEG, WebP or GIF images are accepted");
  }

  return { bytes, mimeType: match.mime, size: bytes.byteLength, checksum: sha256(bytes) };
}

export type UploadedAvatar = NonNullable<Awaited<ReturnType<typeof readAvatarField>>>;

/**
 * Store an avatar and point the user's avatarUrl at it.
 *
 * The URL carries the checksum as a query param so a replaced picture busts
 * any cached copy immediately — the route itself can then be cached hard.
 */
export async function saveAvatar(userId: string, file: UploadedAvatar) {
  const url = `/api/employees/${userId}/avatar?v=${file.checksum.slice(0, 16)}`;

  await db.$transaction([
    db.userAvatar.upsert({
      where: { userId },
      update: { data: file.bytes, mimeType: file.mimeType, size: file.size, checksum: file.checksum },
      create: { userId, data: file.bytes, mimeType: file.mimeType, size: file.size, checksum: file.checksum },
    }),
    db.user.update({ where: { id: userId }, data: { avatarUrl: url } }),
  ]);

  return url;
}

/** Remove a stored avatar, falling back to initials. */
export async function removeAvatar(userId: string) {
  await db.$transaction([
    db.userAvatar.deleteMany({ where: { userId } }),
    db.user.update({ where: { id: userId }, data: { avatarUrl: null } }),
  ]);
}
