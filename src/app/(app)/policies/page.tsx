import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PoliciesClient } from "./policies-client";

export default function PoliciesPage() {
  return (
    <PageContainer>
      <PageHeader title="Company Policies" description="The Elenor Employee Handbook — the source of truth." />
      <div className="mt-6"><PoliciesClient /></div>
    </PageContainer>
  );
}
