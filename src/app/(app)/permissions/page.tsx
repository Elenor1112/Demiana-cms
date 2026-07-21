import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { PermissionsClient } from "./permissions-client";

export default function PermissionsPage() {
  return (
    <PageContainer>
      <PageHeader title="Permission Requests" description="Late arrivals, early leave and short absences." />
      <div className="mt-6"><PermissionsClient /></div>
    </PageContainer>
  );
}
