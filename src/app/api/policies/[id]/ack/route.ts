import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, audit, toErrorResponse, ApiError } from "@/lib/api";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const policy = await db.policy.findUnique({ where: { id } });
    if (!policy) throw new ApiError(404, "Policy not found");

    await db.policyAck.upsert({
      where: { policyId_userId_version: { policyId: id, userId: user.id, version: policy.version } },
      update: {},
      create: { policyId: id, userId: user.id, version: policy.version },
    });
    await audit({ actorId: user.id, action: "policy.acknowledge", entity: "policy", entityId: id, newValue: { version: policy.version } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
