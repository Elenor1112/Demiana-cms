import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TaskBoard } from "@/components/tasks/task-board";

export default function CalendarPage() {
  return (
    <PageContainer>
      <PageHeader title="Calendar" description="Deadlines across all your tasks." />
      <div className="mt-6">
        <Suspense fallback={null}>
          <TaskBoard scope="all" />
        </Suspense>
      </div>
    </PageContainer>
  );
}
