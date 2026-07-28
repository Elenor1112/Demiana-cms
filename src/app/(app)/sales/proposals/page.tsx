import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProposalsClient } from "./proposals-client";

export default function ProposalsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Proposal Center"
        description="Every proposal, its version history and where it stands."
      />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <ProposalsClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
