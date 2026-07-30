import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export default function TasksPage() {
  return (
    <PageContainer>
      <PageHeader title="Tasks" description="Everything on your plate and across the agency." />
      <div className="mt-6">
        <Suspense fallback={null}>
          <TasksWorkspace />
        </Suspense>
      </div>
    </PageContainer>
  );
}
