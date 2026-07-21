import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ApprovalsClient } from "./approvals-client";

export default function ApprovalsPage() {
  return (
    <PageContainer>
      <PageHeader title="Approvals" description="Requests waiting on your decision." />
      <div className="mt-6"><ApprovalsClient /></div>
    </PageContainer>
  );
}
