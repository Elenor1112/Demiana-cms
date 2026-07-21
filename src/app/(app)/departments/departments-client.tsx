"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Users, CheckSquare, Loader2, Network } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/components/session-context";

type Dept = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  head?: { id: string; firstName: string; lastName: string; avatarUrl?: string | null } | null;
  _count: { members: number; tasks: number };
};

const COLORS = ["#06B6D4", "#8B5CF6", "#F59E0B", "#22C55E", "#EF4444", "#0EA5E9", "#EC4899", "#14B8A6"];

export function DepartmentsClient() {
  const can = useCan();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(COLORS[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["departments-full"],
    queryFn: () => apiGet<{ departments: Dept[] }>("/api/departments"),
  });

  const create = useMutation({
    mutationFn: () => apiSend("/api/departments", "POST", { name, description, color }),
    onSuccess: () => {
      toast.success("Department created");
      qc.invalidateQueries({ queryKey: ["departments-full"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      setOpen(false);
      setName(""); setDescription(""); setColor(COLORS[0]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex justify-end">
        {can("Department.Create") && (
          <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New department</Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.departments.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: d.color }} />
                <div className="p-5">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${d.color}1A`, color: d.color }}>
                      <Network className="size-4" />
                    </div>
                    <h3 className="font-semibold">{d.name}</h3>
                  </div>
                  {d.description && <p className="mt-2 text-sm text-muted-foreground">{d.description}</p>}
                  <div className="mt-4 flex items-center justify-between">
                    {d.head ? (
                      <div className="flex items-center gap-2">
                        <Avatar firstName={d.head.firstName} lastName={d.head.lastName} src={d.head.avatarUrl} size={26} />
                        <div className="text-xs">
                          <div className="text-muted-foreground">Head</div>
                          <div className="font-medium">{d.head.firstName} {d.head.lastName}</div>
                        </div>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">No head assigned</span>}
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="size-3" /> {d._count.members}</span>
                      <span className="flex items-center gap-1"><CheckSquare className="size-3" /> {d._count.tasks}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New department">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Motion Design" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`size-7 rounded-full ring-2 ring-offset-2 ring-offset-card transition-all ${color === c ? "ring-foreground" : "ring-transparent"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!name || create.isPending}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
