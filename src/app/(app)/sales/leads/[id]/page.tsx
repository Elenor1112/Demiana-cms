import { Suspense } from "react";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadDetailClient } from "./lead-detail-client";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <LeadDetailClient leadId={id} />
      </Suspense>
    </PageContainer>
  );
}
