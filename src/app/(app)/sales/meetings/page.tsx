import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingsClient } from "./meetings-client";

export default function MeetingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Meetings" description="Every conversation booked with a prospect." />
      <div className="mt-6">
        <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
          <MeetingsClient />
        </Suspense>
      </div>
    </PageContainer>
  );
}
