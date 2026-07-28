import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DiscoveryClient } from "./discovery-client";

export default function DiscoveryPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Discovery Briefs"
        description="What each prospect told us about their business, goals and audience."
      />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <DiscoveryClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
