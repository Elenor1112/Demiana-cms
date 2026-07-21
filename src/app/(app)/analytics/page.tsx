import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AnalyticsClient } from "./analytics-client";

export default function AnalyticsPage() {
  return (
    <PageContainer>
      <PageHeader title="Analytics" description="Company-wide performance and delivery insights." />
      <div className="mt-6"><AnalyticsClient /></div>
    </PageContainer>
  );
}
