import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AnalyticsClient } from "../analytics/analytics-client";

// Performance shares the analytics surface for now; individual employee
// performance lives on each employee profile. This is the department/company view.
export default function PerformancePage() {
  return (
    <PageContainer>
      <PageHeader title="Performance" description="Team productivity, delivery and quality metrics." />
      <div className="mt-6"><AnalyticsClient /></div>
    </PageContainer>
  );
}
