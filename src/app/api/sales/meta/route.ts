import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { can, salesScope } from "@/lib/rbac";
import { leadVisibilityFilter, requireSalesModule } from "@/lib/sales";

/**
 * Everything the sales forms need to populate their dropdowns, in one request.
 *
 * Mirrors /api/tasks/meta: the create dialogs share this cache rather than each
 * issuing its own people/clients query.
 */
export async function GET() {
  try {
    const user = requireSalesModule(await requireUser());
    // Throws 403 for users with no sales access — the forms are unreachable
    // for them anyway, and this keeps the check in one place.
    const visibility = leadVisibilityFilter(user);
    const scope = salesScope(user);

    const [salespeople, activeUsers, clients, leads, tagRows] = await Promise.all([
      // Candidate lead owners: anyone who can work the pipeline. Resolved by
      // PERMISSION, not by role key, so a per-user grant is enough to appear
      // here without a code change.
      db.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { role: { isSuperAdmin: true } },
            { role: { permissions: { some: { permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } } },
            { permissions: { some: { effect: "ALLOW", permission: { key: { in: ["Sales.View", "Sales.ViewAll"] } } } } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true },
        orderBy: [{ firstName: "asc" }],
      }),
      // Meeting attendees and conversion nominees can be anyone active.
      db.user.findMany({
        where: { status: "ACTIVE" },
        select: {
          id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true,
          role: { select: { key: true } },
        },
        orderBy: [{ firstName: "asc" }],
      }),
      db.client.findMany({
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, company: true },
        orderBy: { company: "asc" },
      }),
      // Lead picker for the Ideas form and the meeting scheduler, scoped the
      // same way the lead list is.
      db.lead.findMany({
        where: visibility,
        select: { id: true, code: true, companyName: true, stage: true },
        orderBy: { updatedAt: "desc" },
        take: 300,
      }),
      db.lead.findMany({ where: visibility, select: { tags: true }, take: 500 }),
    ]);

    // Distinct tags for the filter dropdown. Done in memory over the scoped set
    // rather than with a DISTINCT over a String[] column, which Postgres cannot
    // index usefully anyway at this table size.
    const tags = [...new Set(tagRows.flatMap((r) => r.tags))].sort();

    return NextResponse.json({
      salespeople,
      users: activeUsers,
      clients,
      leads,
      tags,
      scope: scope.kind,
      permissions: {
        canAssign: can(user, "Sales.Assign"),
        canConvert: can(user, "Sales.Convert"),
        canDelete: can(user, "Sales.LeadDelete"),
        canChangeStage: can(user, "Sales.ChangeStage"),
        canManageMeetings: can(user, "Sales.MeetingManage"),
        canSubmitDiscovery: can(user, "Sales.DiscoverySubmit"),
        canSubmitFeedback: can(user, "Sales.FeedbackSubmit"),
        canManageProposals: can(user, "Sales.ProposalManage"),
        canViewTeam: can(user, "Sales.ViewTeam"),
        canViewReports: can(user, "Sales.ViewReports"),
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
