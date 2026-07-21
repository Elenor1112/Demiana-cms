import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";

// All requests awaiting THIS user's decision (current pending step assigned to them
// or their role), across leave / permission / resignation.
export async function GET() {
  try {
    const user = await requireUser();

    const pendingSteps = await db.approvalStep.findMany({
      where: {
        decision: "PENDING",
        OR: [
          { approverId: user.id },
          ...(user.isSuperAdmin ? [{}] : [{ roleKey: user.roleKey }]),
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    // only the *current* (lowest-order pending) step per entity is actionable
    const byEntity = new Map<string, (typeof pendingSteps)[number]>();
    for (const s of pendingSteps) {
      const key = `${s.kind}:${s.entityId}`;
      const cur = byEntity.get(key);
      if (!cur || s.order < cur.order) byEntity.set(key, s);
    }

    const leaveIds: string[] = [];
    const permIds: string[] = [];
    const resignIds: string[] = [];
    for (const s of byEntity.values()) {
      if (s.kind === "LEAVE") leaveIds.push(s.entityId);
      else if (s.kind === "PERMISSION") permIds.push(s.entityId);
      else if (s.kind === "RESIGNATION") resignIds.push(s.entityId);
    }

    const [leaves, perms, resigns] = await Promise.all([
      db.leaveRequest.findMany({
        where: { id: { in: leaveIds }, status: "PENDING" },
        include: { requester: { select: { firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } },
      }),
      db.permissionRequest.findMany({
        where: { id: { in: permIds }, status: "PENDING" },
        include: { requester: { select: { firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } },
      }),
      db.resignation.findMany({
        where: { id: { in: resignIds }, status: "PENDING" },
        include: { employee: { select: { firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } },
      }),
    ]);

    return NextResponse.json({
      leaves,
      permissions: perms,
      resignations: resigns,
      total: leaves.length + perms.length + resigns.length,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
