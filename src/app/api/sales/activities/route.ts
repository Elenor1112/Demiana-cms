import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { leadVisibilityFilter, requireSalesModule } from "@/lib/sales";
import type { Prisma } from "@prisma/client";

const userPick = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } };

/**
 * The cross-lead activity feed.
 *
 * Paginated by cursor rather than offset: the feed is append-heavy, and a new
 * row arriving mid-scroll would shift every offset page by one and duplicate an
 * entry. A createdAt/id cursor is stable under inserts.
 */
export async function GET(req: NextRequest) {
  try {
    const user = requireSalesModule(await requireUser());
    const visibility = leadVisibilityFilter(user);
    const sp = req.nextUrl.searchParams;

    const leadId = sp.get("lead");
    const verb = sp.get("verb");
    const actor = sp.get("actor");
    const cursor = sp.get("cursor");
    const take = Math.min(Number(sp.get("take") ?? 50), 100);

    const where: Prisma.SalesActivityWhereInput = {
      ...(visibility ? { lead: visibility } : {}),
      ...(leadId ? { leadId } : {}),
      ...(verb ? { verb } : {}),
      ...(actor ? { actorId: actor } : {}),
    };

    const rows = await db.salesActivity.findMany({
      where,
      include: {
        lead: { select: { id: true, code: true, companyName: true, stage: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // Fetch one extra to know whether another page exists without a count().
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const activities = hasMore ? rows.slice(0, take) : rows;

    const actorIds = [...new Set(activities.map((a) => a.actorId).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await db.user.findMany({ where: { id: { in: actorIds } }, ...userPick })
      : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    return NextResponse.json({
      activities: activities.map((a) => ({
        ...a,
        actor: a.actorId ? (actorMap.get(a.actorId) ?? null) : null,
      })),
      nextCursor: hasMore ? activities[activities.length - 1]?.id : null,
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
