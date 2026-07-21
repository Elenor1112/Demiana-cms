import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TaskBoard } from "@/components/tasks/task-board";

export default function TasksPage() {
  return (
    <PageContainer>
      <PageHeader title="Tasks" description="Everything on your plate and across the agency." />
      <div className="mt-6">
        <Suspense fallback={null}>
          <TaskBoard scope="all" />
        </Suspense>
      </div>
    </PageContainer>
  );
}
