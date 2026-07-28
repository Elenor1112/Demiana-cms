import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PipelineClient } from "./pipeline-client";

export default function PipelinePage() {
  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title="Pipeline"
        description="Drag a deal to move it through the stages."
      />
      <div className="mt-6">
        <PipelineClient />
      </div>
    </PageContainer>
  );
}
