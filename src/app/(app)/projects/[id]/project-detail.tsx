"use client";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Building2, Users, CheckSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { TaskBoard } from "@/components/tasks/task-board";
import { formatDate } from "@/lib/utils";
import { EditProjectButton } from "./edit-project-button";

const PROJECT_STATUS: Record<string, string> = {
  PLANNING: "#64748B", ACTIVE: "#06B6D4", ON_HOLD: "#F59E0B", COMPLETED: "#22C55E", CANCELLED: "#EF4444",
};

export function ProjectDetail({ project }: { project: any }) {
  return (
    <div>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Badge color={PROJECT_STATUS[project.status]}>{project.status.replace("_", " ")}</Badge>
            </div>
            {project.description && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{project.description}</p>}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {project.client && <span className="flex items-center gap-1.5"><Building2 className="size-4" /> {project.client.company}</span>}
              {project.deadline && <span className="flex items-center gap-1.5"><CalendarClock className="size-4" /> Due {formatDate(project.deadline)}</span>}
              <span className="flex items-center gap-1.5"><CheckSquare className="size-4" /> {project.taskCount} tasks</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-3xl font-bold text-primary">{project.progress}%</div>
              <div className="text-xs text-muted-foreground">complete</div>
            </div>
            <EditProjectButton project={project} />
          </div>
        </div>
        <Progress value={project.progress} className="mt-4 h-2.5" />

        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-border pt-4">
          {project.lead && (
            <div className="flex items-center gap-2">
              <Avatar firstName={project.lead.firstName} lastName={project.lead.lastName} src={project.lead.avatarUrl} size={34} />
              <div className="text-xs">
                <div className="text-muted-foreground">Project lead</div>
                <div className="font-medium">{project.lead.firstName} {project.lead.lastName}</div>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="text-xs">
              <div className="flex items-center gap-1 text-muted-foreground"><Users className="size-3" /> Team</div>
              <div className="mt-1"><AvatarGroup users={project.members.map((m: any) => m.user)} size={28} max={6} /></div>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Tasks</h2>
        <TaskBoard fixedProjectId={project.id} />
      </div>
    </div>
  );
}
