import { notFound } from "next/navigation";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { PageContainer } from "@/components/shell/page-header";
import { ProjectDetail } from "./project-detail";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: true,
      lead: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } },
      members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, jobTitle: true } } } },
      tasks: { where: { parentId: null }, select: { status: true, progress: true } },
    },
  });
  if (!project) notFound();

  const active = project.tasks.filter((t) => t.status !== "CANCELLED");
  const progress = active.length
    ? Math.round(active.reduce((s, t) => s + (t.status === "DONE" ? 100 : t.progress), 0) / active.length)
    : 0;

  const { tasks, ...rest } = project;
  return (
    <PageContainer>
      <Suspense fallback={null}>
        <ProjectDetail project={JSON.parse(JSON.stringify({ ...rest, progress, taskCount: tasks.length }))} />
      </Suspense>
    </PageContainer>
  );
}
