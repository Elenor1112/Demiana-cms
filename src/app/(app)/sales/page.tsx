import { getSessionUser } from "@/lib/auth";
import { salesScope } from "@/lib/rbac";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { SalesDashboardClient } from "./sales-dashboard-client";
import { MyDashboardClient } from "./my-dashboard-client";

/**
 * The Sales dashboard, resolved by role.
 *
 * A Sales Member gets a personal dashboard — their own schedule, their own
 * pipeline, their own numbers. A manager (Sales.ViewAll, or a super admin) gets
 * the agency-wide view.
 *
 * One route rather than two so the sidebar has a single "Dashboard" entry and
 * neither audience has to know the other view exists. The split is decided
 * here, on the server, from the session — and each dashboard calls a different
 * API which enforces the same boundary independently.
 */
export default async function SalesDashboardPage() {
  const user = await getSessionUser();
  // The layout has already redirected anyone without module access, so a
  // missing user here is impossible in practice; `own` is the safe default.
  const scope = user ? salesScope(user).kind : "own";
  const isManagerView = scope === "all";

  return (
    <PageContainer>
      <PageHeader
        title={isManagerView ? "Sales" : "My Sales"}
        description={
          isManagerView
            ? "Pipeline health, this month's numbers and what needs attention today."
            : "Your schedule, your pipeline and how you are tracking."
        }
      />
      <div className="mt-6">
        {isManagerView ? <SalesDashboardClient /> : <MyDashboardClient />}
      </div>
    </PageContainer>
  );
}
