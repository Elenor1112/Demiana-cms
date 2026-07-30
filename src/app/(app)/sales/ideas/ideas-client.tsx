"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Search, Loader2, Trash2, Wand2 } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  EmptyState, CardGridSkeleton, formatRelative, type PersonRef,
} from "@/components/sales/sales-bits";
import { Field } from "@/components/sales/lead-dialog";
import { todayInputMin } from "@/lib/utils";
import { useSalesMeta } from "@/components/sales/use-sales-meta";
import {
  IDEA_STATUS_META, IDEA_IMPACT_META, LEAD_PRIORITY_META,
} from "@/lib/sales-constants";
import type { IdeaImpact, IdeaStatus, LeadPriority } from "@prisma/client";

type IdeaRow = {
  id: string; title: string; description: string | null; category: string | null;
  priority: LeadPriority; estimatedImpact: IdeaImpact; status: IdeaStatus;
  convertedTaskId: string | null; convertedProjectId: string | null;
  convertedAt: string | null; createdAt: string;
  owner: PersonRef | null; createdBy: PersonRef;
  lead: { id: string; code: string; companyName: string } | null;
  client: { id: string; company: string } | null;
};

export function IdeasClient() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: meta } = useSalesMeta();

  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [open, setOpen] = React.useState(params.get("new") === "1");
  const [editing, setEditing] = React.useState<IdeaRow | null>(null);
  const [deleting, setDeleting] = React.useState<IdeaRow | null>(null);
  const [converting, setConverting] = React.useState<IdeaRow | null>(null);

  const [debouncedQ, setDebouncedQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const qp = new URLSearchParams();
  if (debouncedQ) qp.set("q", debouncedQ);
  if (status) qp.set("status", status);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-ideas", debouncedQ, status],
    queryFn: () => apiGet<{ ideas: IdeaRow[] }>(`/api/sales/ideas?${qp.toString()}`),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: IdeaStatus }) =>
      apiSend(`/api/sales/ideas/${id}`, "PATCH", { status: next }),
    onSuccess: () => {
      toast.success("Idea updated");
      qc.invalidateQueries({ queryKey: ["sales-ideas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiSend(`/api/sales/ideas/${id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Idea deleted");
      qc.invalidateQueries({ queryKey: ["sales-ideas"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ideas = data?.ideas ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ideas…"
            className="pl-9"
          />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
          <option value="">Any status</option>
          {Object.entries(IDEA_STATUS_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="size-4" /> New idea
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-4"><CardGridSkeleton height="h-52" /></div>
      ) : ideas.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon="Lightbulb"
            title="No ideas yet"
            description="Capture an opportunity, then convert it into a task or project when it is approved."
            action={
              <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New idea</Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ideas.map((idea, i) => (
            <motion.div
              key={idea.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Card className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{idea.title}</h3>
                  <Badge color={IDEA_STATUS_META[idea.status].color}>
                    {IDEA_STATUS_META[idea.status].label}
                  </Badge>
                </div>

                {idea.category && (
                  <p className="text-xs text-muted-foreground">{idea.category}</p>
                )}
                {idea.description && (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {idea.description}
                  </p>
                )}

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge color={LEAD_PRIORITY_META[idea.priority].color} className="text-[10px]">
                    {LEAD_PRIORITY_META[idea.priority].label}
                  </Badge>
                  <Badge color={IDEA_IMPACT_META[idea.estimatedImpact].color} className="text-[10px]">
                    {IDEA_IMPACT_META[idea.estimatedImpact].label} impact
                  </Badge>
                </div>

                {(idea.lead || idea.client) && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {idea.lead && (
                      <Link href={`/sales/leads/${idea.lead.id}`} className="hover:text-primary">
                        {idea.lead.companyName}
                      </Link>
                    )}
                    {idea.client && <span>{idea.client.company}</span>}
                  </div>
                )}

                {idea.convertedAt && (
                  <div className="mt-2 text-xs">
                    {idea.convertedTaskId && (
                      <Link href={`/tasks?task=${idea.convertedTaskId}`} className="text-primary hover:underline">
                        View task →
                      </Link>
                    )}
                    {idea.convertedProjectId && (
                      <Link href={`/projects/${idea.convertedProjectId}`} className="text-primary hover:underline">
                        View project →
                      </Link>
                    )}
                  </div>
                )}

                <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
                  {idea.owner && (
                    <Avatar
                      firstName={idea.owner.firstName}
                      lastName={idea.owner.lastName}
                      src={idea.owner.avatarUrl}
                      size={20}
                    />
                  )}
                  <span className="truncate">{formatRelative(idea.createdAt)}</span>

                  <div className="ml-auto flex items-center gap-1">
                    {/* Status moves inline: triaging a backlog should not need
                        a dialog per idea. */}
                    {!idea.convertedAt && (
                      <Select
                        value={idea.status}
                        onChange={(e) =>
                          changeStatus.mutate({ id: idea.id, next: e.target.value as IdeaStatus })
                        }
                        className="h-7 w-32 text-xs"
                        aria-label={`Status of ${idea.title}`}
                      >
                        {Object.entries(IDEA_STATUS_META).map(([k, m]) => (
                          <option key={k} value={k}>{m.label}</option>
                        ))}
                      </Select>
                    )}
                    {idea.status === "APPROVED" && !idea.convertedAt && (
                      <button
                        onClick={() => setConverting(idea)}
                        aria-label={`Convert ${idea.title}`}
                        className="rounded-md p-1.5 transition-colors hover:bg-accent hover:text-foreground"
                        title="Convert to task or project"
                      >
                        <Wand2 className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleting(idea)}
                      aria-label={`Delete ${idea.title}`}
                      className="rounded-md p-1.5 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <IdeaDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setEditing(null);
          if (params.get("new")) router.replace("/sales/ideas");
        }}
        idea={editing}
      />

      {converting && (
        <ConvertIdeaDialog idea={converting} onClose={() => setConverting(null)} />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        title={`Delete "${deleting?.title ?? "idea"}"?`}
        description="This removes the idea. Any task or project already created from it is unaffected."
        pending={remove.isPending}
      />
    </div>
  );
}

function IdeaDialog({
  open,
  onClose,
  idea,
}: {
  open: boolean;
  onClose: () => void;
  idea?: IdeaRow | null;
}) {
  const qc = useQueryClient();
  const { data: meta } = useSalesMeta();
  const editing = Boolean(idea);

  type FormValues = {
    title: string; description: string; category: string;
    leadId: string; clientId: string;
    priority: string; estimatedImpact: string; status: string; ownerId: string;
  };
  const { register, handleSubmit, reset } = useForm<FormValues>();

  React.useEffect(() => {
    if (!open) return;
    reset({
      title: idea?.title ?? "",
      description: idea?.description ?? "",
      category: idea?.category ?? "",
      leadId: idea?.lead?.id ?? "",
      clientId: idea?.client?.id ?? "",
      priority: idea?.priority ?? "MEDIUM",
      estimatedImpact: idea?.estimatedImpact ?? "MEDIUM",
      status: idea?.status ?? "NEW",
      ownerId: idea?.owner?.id ?? "",
    });
  }, [open, idea, reset]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const payload = {
        title: v.title,
        description: v.description || undefined,
        category: v.category || undefined,
        leadId: v.leadId || null,
        clientId: v.clientId || null,
        priority: v.priority,
        estimatedImpact: v.estimatedImpact,
        status: v.status,
        ownerId: v.ownerId || null,
      };
      return editing
        ? apiSend(`/api/sales/ideas/${idea!.id}`, "PATCH", payload)
        : apiSend("/api/sales/ideas", "POST", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Idea updated" : "Idea created");
      qc.invalidateQueries({ queryKey: ["sales-ideas"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "Edit idea" : "New idea"}
      className="max-w-xl"
    >
      <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4">
        <Field label="Title" required>
          <Input {...register("title", { required: true })} autoFocus />
        </Field>
        <Field label="Description">
          <Textarea {...register("description")} rows={4} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Category"><Input {...register("category")} placeholder="e.g. Upsell, Campaign" /></Field>
          <Field label="Owner">
            <Select {...register("ownerId")}>
              <option value="">Me</option>
              {(meta?.salespeople ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
              ))}
            </Select>
          </Field>
          <Field label="Related lead">
            <Select {...register("leadId")}>
              <option value="">None</option>
              {(meta?.leads ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.companyName} ({l.code})</option>
              ))}
            </Select>
          </Field>
          <Field label="Related client">
            <Select {...register("clientId")}>
              <option value="">None</option>
              {(meta?.clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.company}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select {...register("priority")}>
              {Object.entries(LEAD_PRIORITY_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Estimated impact">
            <Select {...register("estimatedImpact")}>
              {Object.entries(IDEA_IMPACT_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select {...register("status")}>
              {Object.entries(IDEA_STATUS_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Create idea"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ConvertIdeaDialog({ idea, onClose }: { idea: IdeaRow; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: meta } = useSalesMeta();
  const [target, setTarget] = React.useState<"task" | "project">("task");
  const [clientId, setClientId] = React.useState(idea.client?.id ?? "");
  const [deadline, setDeadline] = React.useState("");

  const convert = useMutation({
    mutationFn: () =>
      apiSend<{ task?: { id: string }; project?: { id: string } }>(
        `/api/sales/ideas/${idea.id}`,
        "POST",
        { target, clientId: clientId || null, deadline: deadline || null, assigneeIds: [] }
      ),
    onSuccess: (res) => {
      toast.success(target === "task" ? "Task created" : "Project created");
      qc.invalidateQueries({ queryKey: ["sales-ideas"] });
      onClose();
      if (res.task) router.push(`/tasks?task=${res.task.id}`);
      if (res.project) router.push(`/projects/${res.project.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Convert "${idea.title}"`}
      description="Turn this idea into real work."
    >
      <div className="space-y-4">
        <Field label="Convert to">
          <Select value={target} onChange={(e) => setTarget(e.target.value as "task" | "project")}>
            <option value="task">Task</option>
            <option value="project">Project</option>
          </Select>
        </Field>
        {/* A project must belong to a client; a task may not. */}
        <Field
          label="Client"
          required={target === "project"}
          hint={target === "project" ? "Projects must belong to a client." : "Optional for a task."}
        >
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">None</option>
            {(meta?.clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.company}</option>
            ))}
          </Select>
        </Field>
        <Field label="Deadline">
          <Input
            type="date"
            min={todayInputMin()}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => convert.mutate()}
            disabled={convert.isPending || (target === "project" && !clientId)}
          >
            {convert.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            Convert
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
