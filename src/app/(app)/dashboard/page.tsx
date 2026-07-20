import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { getSessionUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getSessionUser();
  return (
    <PageContainer>
      <PageHeader
        title={`Welcome back, ${user?.firstName ?? ""} 👋`}
        description="Here's what's happening across Elenor today."
      />
      <div className="mt-6 text-sm text-muted-foreground">Dashboard coming up next…</div>
    </PageContainer>
  );
}
