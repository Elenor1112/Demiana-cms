import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageContainer } from "@/components/shell/page-header";
import { EmployeeProfile } from "./employee-profile";

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await db.user.findUnique({
    where: { id },
    include: {
      role: true,
      department: true,
      manager: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      reports: {
        select: {
          id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true,
          role: { select: { name: true } },
        },
      },
      warnings: {
        include: { issuedBy: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
      },
      achievements: { orderBy: { awardedAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
      _count: { select: { assignedTasks: true, leaveRequests: true } },
    },
  });
  if (!employee) notFound();

  const { passwordHash, ...safe } = employee;
  return (
    <PageContainer>
      <EmployeeProfile employee={JSON.parse(JSON.stringify(safe))} />
    </PageContainer>
  );
}
