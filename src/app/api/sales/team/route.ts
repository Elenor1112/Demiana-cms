import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse, ApiError } from "@/lib/api";
import { can } from "@/lib/rbac";
import { companyMonthStart, totalValue, weightedValue, OPEN_STAGES } from "@/lib/sales";
import type { LeadStage } from "@prisma/client";

/**
 * Manager view of the sales team.
 *
 * Gated on Sales.ViewTeam rather than on a role, so a deputy can be granted the
 * leaderboard without becoming a manager. Unscoped by design: this endpoint
 * exists to compare salespeople, which is only meaningful across everyone.
 */
export async function GET() {
  try {
    const user = await requireUser();
    if (!can(user, "Sales.ViewTeam")) {
      throw new ApiError(403, "Missing permission: Sales.ViewTeam");
    }

    const now = new Date();
    const monthStart = companyMonthStart(0, now);

    // The team is everyone who can work the pipeline, resolved by permission so
    // a per-user grant is enough to appear here.
    const members = await db.user.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { role: { permissions: { some: { permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } } },
          { permissions: { some: { effect: "ALLOW", permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } },
        ],
      },
      select: {
        id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true,
        role: { select: { key: true, name: true } },
      },
      orderBy: { firstName: "asc" },
    });

    const rows = await Promise.all(
      members.map(async (m) => {
        const [
          openLeads, wonLeads, lostCount, meetingsHeld, activityCount,
          followUpsDue, followUpsTotal, proposalsSent, proposalsAccepted,
        ] = await Promise.all([
          db.lead.findMany({
            where: { ownerId: m.id, stage: { in: OPEN_STAGES } },
            select: { estimatedValue: true, probability: true },
          }),
          db.lead.findMany({
            where: { ownerId: m.id, stage: "WON" },
            select: { estimatedValue: true, wonAt: true, createdAt: true },
          }),
          db.lead.count({ where: { ownerId: m.id, stage: "LOST" } }),
          db.salesMeeting.count({
            where: { organizerId: m.id, status: "COMPLETED" },
          }),
          db.salesActivity.count({
            where: { actorId: m.id, createdAt: { gte: monthStart } },
          }),
          // Overdue follow-ups are the miss; the pair gives a completion rate.
          db.lead.count({
            where: { ownerId: m.id, stage: { in: OPEN_STAGES }, nextFollowUpAt: { lte: now } },
          }),
          db.lead.count({
            where: { ownerId: m.id, stage: { in: OPEN_STAGES }, nextFollowUpAt: { not: null } },
          }),
          db.proposal.count({ where: { lead: { ownerId: m.id }, sentAt: { not: null } } }),
          db.proposal.count({ where: { lead: { ownerId: m.id }, status: "ACCEPTED" } }),
        ]);

        const closed = wonLeads.length + lostCount;
        const revenueClosed = Math.round(totalValue(wonLeads));

        return {
          userId: m.id,
          name: `${m.firstName} ${m.lastName}`,
          avatarUrl: m.avatarUrl,
          jobTitle: m.jobTitle,
          roleName: m.role.name,
          meetings: meetingsHeld,
          pipelineValue: Math.round(totalValue(openLeads)),
          forecast: Math.round(weightedValue(openLeads)),
          openLeads: openLeads.length,
          dealsWon: wonLeads.length,
          dealsLost: lostCount,
          conversionRate: closed ? Math.round((wonLeads.length / closed) * 100) : 0,
          avgDealSize: wonLeads.length ? Math.round(revenueClosed / wonLeads.length) : 0,
          revenueClosed,
          activities: activityCount,
          // Share of scheduled follow-ups that are NOT overdue.
          followUpCompletion: followUpsTotal
            ? Math.round(((followUpsTotal - followUpsDue) / followUpsTotal) * 100)
            : 100,
          proposalsSent,
          proposalsAccepted,
        };
      })
    );

    // The leaderboard: revenue first, then deals won as the tie-break.
    const leaderboard = [...rows].sort(
      (a, b) => b.revenueClosed - a.revenueClosed || b.dealsWon - a.dealsWon
    );

    return NextResponse.json({
      team: rows,
      leaderboard,
      totals: {
        pipelineValue: rows.reduce((s, r) => s + r.pipelineValue, 0),
        revenueClosed: rows.reduce((s, r) => s + r.revenueClosed, 0),
        dealsWon: rows.reduce((s, r) => s + r.dealsWon, 0),
        dealsLost: rows.reduce((s, r) => s + r.dealsLost, 0),
        meetings: rows.reduce((s, r) => s + r.meetings, 0),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
