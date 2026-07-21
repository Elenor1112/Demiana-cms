import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { LeaveClient } from "./leave-client";

export default function LeavePage() {
  return (
    <PageContainer>
      <PageHeader title="Leave" description="Request time off and track approvals." />
      <div className="mt-6"><LeaveClient /></div>
    </PageContainer>
  );
}
