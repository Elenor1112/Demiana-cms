import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadsClient } from "./leads-client";

export default function LeadsPage() {
  return (
    <PageContainer>
      <PageHeader title="Leads" description="Every company in the acquisition pipeline." />
      <div className="mt-6">
        {/* useSearchParams needs a Suspense boundary to keep the page
            statically renderable up to the filter state. */}
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <LeadsClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
