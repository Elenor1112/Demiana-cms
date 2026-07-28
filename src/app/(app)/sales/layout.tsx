import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canSeeSalesModule } from "@/lib/rbac";

/**
 * Gate the whole Sales segment.
 *
 * Checked once here rather than in each page: every route below needs the same
 * answer, and doing it in the layout means a new page cannot be added without
 * inheriting the guard.
 *
 * Gated on canSeeSalesModule, NOT on salesScope: holding Sales.ViewConverted
 * (Account Management, post-handover) grants the right to read a closed deal's
 * history through /api/sales/clients, but not to enter the workspace. Only
 * CEO, Operations Manager, PR & Sales Manager and Sales Members get in.
 *
 * This is a UI reachability check. Every API enforces its own authorization
 * independently, so a hand-crafted request is refused regardless of this guard.
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canSeeSalesModule(user)) redirect("/dashboard");

  return <>{children}</>;
}
