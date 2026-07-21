import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your profile, appearance and account." />
      <div className="mt-6"><SettingsClient /></div>
    </PageContainer>
  );
}
