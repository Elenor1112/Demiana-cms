import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AuditClient } from "./audit-client";

export default function AuditPage() {
  return (
    <PageContainer>
      <PageHeader title="Audit Logs" description="A complete trail of who did what, and when." />
      <div className="mt-6"><AuditClient /></div>
    </PageContainer>
  );
}
