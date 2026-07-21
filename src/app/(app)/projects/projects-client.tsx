"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, FolderKanban, CalendarClock, Loader2 } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AvatarGroup } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { useCan } from "@/components/session-context";

const PROJECT_STATUS: Record<string, string> = {
  PLANNING: "#64748B", ACTIVE: "#06B6D4", ON_HOLD: "#F59E0B", COMPLETED: "#22C55E", CANCELLED: "#EF4444",
};

type Project = {
  id: string; name: string; status: string; industry?: string | null; deadline?: string | null;
  progress: number;
  client?: { id: string; company: string } | null;
  lead?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
  members: { user: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } }[];
  _count: { tasks: number };
};

export function ProjectsClient() {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<any>();

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<{ projects: Project[] }>("/api/projects"),
  });
  const { data: meta } = useQuery({
    queryKey: ["task-meta"], queryFn: () => apiGet<any>("/api/tasks/meta"), enabled: open,
  });

  const create = useMutation({
    mutationFn: (v: any) => apiSend("/api/projects", "POST", v),
    onSuccess: () => { toast.success("Project created"); qc.invalidateQueries({ queryKey: ["projects"] }); reset(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-end">
        {can("Project.Create") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New project</Button>}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data?.projects.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link href={`/projects/${p.id}`}>
                <Card className="h-full p-5 transition-all hover:border-primary/40 hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FolderKanban className="size-5" />
                    </div>
                    <Badge color={PROJECT_STATUS[p.status]}>{p.status.replace("_", " ")}</Badge>
                  </div>
                  <h3 className="mt-3 font-semibold leading-tight">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{p.client?.company ?? "Internal"}{p.industry ? ` · ${p.industry}` : ""}</p>

                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <AvatarGroup users={p.members.map((m) => m.user)} size={24} max={4} />
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{p._count.tasks} tasks</span>
                      {p.deadline && <span className="flex items-center gap-1"><CalendarClock className="size-3" />{formatDate(p.deadline)}</span>}
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New project" className="max-w-xl">
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <div className="space-y-1.5"><Label>Name</Label><Input {...register("name", { required: true })} autoFocus /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea {...register("description")} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Client</Label>
              <Select {...register("clientId")} defaultValue="">
                <option value="">Internal</option>
                {meta?.clients?.map((c: any) => <option key={c.id} value={c.id}>{c.company}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Industry</Label><Input {...register("industry")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" {...register("startDate")} /></div>
            <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" {...register("deadline")} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="size-4 animate-spin" />} Create</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
