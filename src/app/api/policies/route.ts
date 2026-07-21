import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const policies = await db.policy.findMany({ orderBy: { order: "asc" } });
    const acks = await db.policyAck.findMany({ where: { userId: user.id } });
    const ackedIds = new Set(acks.map((a) => `${a.policyId}:${a.version}`));
    return NextResponse.json({
      policies: policies.map((p) => ({ ...p, acknowledged: ackedIds.has(`${p.id}:${p.version}`) })),
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
