import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { DepartmentsClient } from "./departments-client";

export default function DepartmentsPage() {
  return (
    <PageContainer>
      <PageHeader title="Departments" description="Organize your teams and their leads." />
      <div className="mt-6">
        <DepartmentsClient />
      </div>
    </PageContainer>
  );
}
