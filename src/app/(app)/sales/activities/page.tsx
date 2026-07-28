import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ActivitiesClient } from "./activities-client";

export default function ActivitiesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Activities"
        description="Everything that has happened across the pipeline, newest first."
      />
      <div className="mt-6">
        <ActivitiesClient />
      </div>
    </PageContainer>
  );
}
