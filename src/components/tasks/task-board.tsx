"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutGrid, List as ListIcon, Table2, Calendar as CalendarIcon,
  Plus, Search, SlidersHorizontal,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/components/session-context";
import { KanbanView } from "./kanban-view";
import { ListView } from "./list-view";
import { TableView } from "./table-view";
import { CalendarView } from "./calendar-view";
import { TaskDetail } from "./task-detail";
import { CreateTaskDialog } from "./create-task-dialog";
import { PRIORITY_META } from "@/lib/constants";
import type { TaskListItem } from "./task-bits";

type View = "kanban" | "list" | "table" | "calendar";
const VIEWS: { key: View; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "kanban", label: "Board", icon: LayoutGrid },
  { key: "list", label: "List", icon: ListIcon },
  { key: "table", label: "Table", icon: Table2 },
  { key: "calendar", label: "Calendar", icon: CalendarIcon },
];

export function TaskBoard({
  scope,
  fixedProjectId,
  title,
}: {
  scope?: "mine" | "all";
  fixedProjectId?: string;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const can = useCan();

  const [view, setView] = React.useState<View>("kanban");
  const [q, setQ] = React.useState("");
  const [group, setGroup] = React.useState("");
  const [priority, setPriority] = React.useState("");
  const [client, setClient] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);

  // Client list for the filter. Shares the task-meta cache the create dialog
  // already populates, so this adds no extra request in the common case.
  const { data: meta } = useQuery({
    queryKey: ["task-meta"],
    queryFn: () => apiGet<{ clients: { id: string; company: string }[] }>("/api/tasks/meta"),
    staleTime: 5 * 60_000,
  });

  const openTaskId = params.get("task");
  const setOpenTask = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("task", id);
    else sp.delete("task");
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const qp = new URLSearchParams();
  if (q) qp.set("q", q);
  if (group) qp.set("group", group);
  if (priority) qp.set("priority", priority);
  if (client) qp.set("client", client);
  if (scope === "mine") qp.set("mine", "1");
  if (fixedProjectId) qp.set("project", fixedProjectId);

  const queryKey = ["tasks", scope ?? "all", fixedProjectId ?? "", q, group, priority, client];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<{ tasks: TaskListItem[] }>(`/api/tasks?${qp.toString()}`),
  });
  const tasks = data?.tasks ?? [];

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                view === v.key ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <v.icon className="size-4" />
              <span className="hidden sm:inline">{v.label}</span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="pl-9" />
        </div>

        <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-32">
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-36">
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </Select>
        {/* Filtering by client hits Task.clientId directly — the denormalized
            copy exists precisely so this needs no join through Project.
            Hidden on a project board, where the client is already fixed. */}
        {!fixedProjectId && (
          <Select value={client} onChange={(e) => setClient(e.target.value)} className="w-40">
            <option value="">Any client</option>
            {meta?.clients?.map((c) => (
              <option key={c.id} value={c.id}>{c.company}</option>
            ))}
          </Select>
        )}

        {can("Task.Create") && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New task</Button>
        )}
      </div>

      {/* body */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-96 w-72 rounded-xl" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
            <SlidersHorizontal className="size-9 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">No tasks match your filters.</p>
            {can("Task.Create") && (
              <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Create the first task</Button>
            )}
          </div>
        ) : (
          <>
            {view === "kanban" && <KanbanView tasks={tasks} onOpen={setOpenTask} queryKey={queryKey} />}
            {view === "list" && <ListView tasks={tasks} onOpen={setOpenTask} />}
            {view === "table" && <TableView tasks={tasks} onOpen={setOpenTask} />}
            {view === "calendar" && <CalendarView tasks={tasks} onOpen={setOpenTask} />}
          </>
        )}
      </div>

      <TaskDetail taskId={openTaskId} onClose={() => setOpenTask(null)} />
      <CreateTaskDialog open={createOpen} onClose={() => setCreateOpen(false)} defaultProjectId={fixedProjectId} />
    </div>
  );
}
