import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ProjectsClient } from "./projects-client";

export default function ProjectsPage() {
  return (
    <PageContainer>
      <PageHeader title="Projects" description="Client work, campaigns and internal initiatives." />
      <div className="mt-6">
        <ProjectsClient />
      </div>
    </PageContainer>
  );
}
