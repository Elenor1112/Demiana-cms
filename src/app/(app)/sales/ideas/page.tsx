import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { IdeasClient } from "./ideas-client";

export default function IdeasPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Ideas"
        description="Opportunities and initiatives worth pursuing — convertible into tasks or projects."
      />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <IdeasClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
