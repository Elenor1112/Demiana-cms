import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { getSessionUser } from "@/lib/auth";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const user = await getSessionUser();
  return (
    <PageContainer>
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ""} 👋`}
        description="Here's what's happening across Elenor today."
      />
      <div className="mt-6">
        <DashboardClient />
      </div>
    </PageContainer>
  );
}
