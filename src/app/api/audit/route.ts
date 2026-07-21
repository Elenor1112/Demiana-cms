import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, toErrorResponse } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requirePermission("Audit.View");
    const sp = req.nextUrl.searchParams;
    const entity = sp.get("entity");
    const take = Math.min(Number(sp.get("take") ?? 100), 200);

    const logs = await db.auditLog.findMany({
      where: entity ? { entity } : {},
      include: { actor: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { createdAt: "desc" },
      take,
    });
    return NextResponse.json({ logs });
  } catch (e) {
    return toErrorResponse(e);
  }
}
