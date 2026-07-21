import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmployeesClient } from "./employees-client";

export default function EmployeesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Employees"
        description="Your team directory, org structure and access control."
      />
      <div className="mt-6">
        <EmployeesClient />
      </div>
    </PageContainer>
  );
}
