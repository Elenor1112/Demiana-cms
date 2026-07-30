"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { UserCircle2, Building2 } from "lucide-react";
import { useCan } from "@/components/session-context";
import { TaskBoard } from "./task-board";
import { TaskDetail } from "./task-detail";

/**
 * The /tasks page body.
 *
 * Someone with Task.ViewAll sees every task in the agency, which is exactly the
 * problem: their own work is buried among hundreds of rows they merely oversee.
 * For them the page splits in two — "My Tasks" (assigned to or executed by
 * them) on top, the whole agency below — so the first thing a CEO or Operations
 * Manager sees is their own plate.
 *
 * Everyone else is already scoped to their own work by taskVisibilityFilter on
 * the server, so a second board would list the same rows twice. They keep the
 * single board they have always had.
 */
export function TasksWorkspace() {
  const can = useCan();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const seesEverything = can("Task.ViewAll");

  // One panel for both boards. Each board still writes `?task=`; only the
  // reading and rendering is hoisted, so a card in either section opens the
  // same single drawer.
  const openTaskId = params.get("task");
  const closeTask = React.useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("task");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  if (!seesEverything) return <TaskBoard scope="all" />;

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading
          icon={UserCircle2}
          title="My Tasks"
          description="Work assigned to you, or delegated to you to execute."
        />
        {/* scope="mine" sends ?mine=1, which the API narrows to tasks where you
            are an assignee or the worker — the same definition the dashboard
            uses, so the two can never disagree. */}
        <TaskBoard scope="mine" renderDetail={false} />
      </section>

      <section>
        <SectionHeading
          icon={Building2}
          title="All Tasks"
          description="Every task across the agency."
        />
        <TaskBoard scope="all" renderDetail={false} />
      </section>

      <TaskDetail taskId={openTaskId} onClose={closeTask} />
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div>
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
