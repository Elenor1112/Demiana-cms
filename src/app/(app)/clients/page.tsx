import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ClientsClient } from "./clients-client";

export default function ClientsPage() {
  return (
    <PageContainer>
      <PageHeader title="Clients" description="The companies Elenor works with." />
      <div className="mt-6"><ClientsClient /></div>
    </PageContainer>
  );
}
