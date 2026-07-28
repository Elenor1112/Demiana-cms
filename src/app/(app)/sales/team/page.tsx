import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TeamClient } from "./team-client";

export default function SalesTeamPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Sales Team"
        description="How each salesperson is performing across the pipeline."
      />
      <div className="mt-6">
        <TeamClient />
      </div>
    </PageContainer>
  );
}
