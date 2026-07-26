import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { JobDescriptionClient } from "./job-description-client";

export default function JobDescriptionPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Job Description"
        description="Your role, responsibilities and expectations — read it and confirm you understand."
      />
      <div className="mt-6">
        <JobDescriptionClient />
      </div>
    </PageContainer>
  );
}
