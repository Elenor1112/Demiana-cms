import { NextResponse } from "next/server";
import { requireUser, toErrorResponse } from "@/lib/api";
import { pushConfigured } from "@/lib/push";

/**
 * The VAPID public key is not a secret (it ships to the browser), but this is
 * gated to authenticated users so the endpoint cannot be used to fingerprint
 * the deployment anonymously.
 */
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
      configured: pushConfigured(),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
