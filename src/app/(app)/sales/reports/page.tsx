import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ReportsClient } from "./reports-client";

export default function SalesReportsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Sales Reports"
        description="Win rates, cycle times, forecasts and growth — exportable."
      />
      <div className="mt-6">
        <ReportsClient />
      </div>
    </PageContainer>
  );
}
