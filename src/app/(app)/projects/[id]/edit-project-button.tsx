"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Loader2 } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/components/session-context";
import { toDateInputValue, todayInputMin } from "@/lib/utils";

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;

/** Edit affordance for the project detail page (server component). */
export function EditProjectButton({ project }: { project: any }) {
  const can = useCan();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [status, setStatus] = React.useState(project.status);
  const [deadline, setDeadline] = React.useState(toDateInputValue(project.deadline));

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/projects/${project.id}`, "PATCH", {
        name,
        description,
        status,
        deadline: deadline || null,
      }),
    onSuccess: () => {
      toast.success("Project updated");
      setOpen(false);
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!can("Project.Edit")) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Edit
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Edit ${project.name}`} className="max-w-lg">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              {/* min is the browser-level guard; the API rejects a past date
                  regardless, so a typed-in value cannot slip through. */}
              <Input
                type="date"
                min={todayInputMin()}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!name || save.isPending}>
              {save.isPending && <Loader2 className="size-4 animate-spin" />} Save changes
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
