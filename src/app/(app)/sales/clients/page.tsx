import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { SalesClientsClient } from "./sales-clients-client";

export default function SalesClientsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Clients"
        description="Deals that closed and became accounts, with their sales history intact."
      />
      <div className="mt-6">
        <SalesClientsClient />
      </div>
    </PageContainer>
  );
}
