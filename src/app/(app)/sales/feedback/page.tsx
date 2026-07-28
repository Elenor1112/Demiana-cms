import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackClient } from "./feedback-client";

export default function FeedbackPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Sales Feedback"
        description="Post-meeting debriefs and the opportunity score they produce."
      />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <FeedbackClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
