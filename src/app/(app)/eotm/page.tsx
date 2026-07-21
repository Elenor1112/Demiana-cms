import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EotmClient } from "./eotm-client";

export default function EotmPage() {
  return (
    <PageContainer>
      <PageHeader title="Employee of the Month" description="Recognizing outstanding performance across Elenor." />
      <div className="mt-6"><EotmClient /></div>
    </PageContainer>
  );
}
