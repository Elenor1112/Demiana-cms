import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { recomputeAndStore, currentPeriod, getConfig } from "@/lib/eotm";

// Leaderboard + winner + hall of fame for a period.
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const period = req.nextUrl.searchParams.get("period") || currentPeriod();

    // ensure fresh scores for the requested period
    await recomputeAndStore(period);

    const [scores, winner, hallOfFame, config] = await Promise.all([
      db.eotmScore.findMany({
        where: { period },
        orderBy: { total: "desc" },
        take: 20,
      }),
      db.eotmWinner.findUnique({
        where: { period },
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true, role: { select: { name: true } } } } },
      }),
      db.eotmWinner.findMany({
        orderBy: { period: "desc" },
        take: 12,
        include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      }),
      getConfig(),
    ]);

    // hydrate leaderboard with user info
    const userIds = scores.map((s) => s.userId);
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true, department: { select: { name: true, color: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const leaderboard = scores.map((s, i) => ({ rank: i + 1, ...s, user: userMap.get(s.userId) }));

    return NextResponse.json({ period, leaderboard, winner, hallOfFame, config });
  } catch (e) {
    return toErrorResponse(e);
  }
}
