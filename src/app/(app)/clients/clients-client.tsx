"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, Building2, Mail, Phone, Search, Loader2 } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/components/session-context";

const STATUS: Record<string, string> = { ACTIVE: "#22C55E", PROSPECT: "#0EA5E9", INACTIVE: "#64748B", ARCHIVED: "#94A3B8" };

export function ClientsClient() {
  const can = useCan();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const { register, handleSubmit, reset } = useForm<any>();

  const { data, isLoading } = useQuery({ queryKey: ["clients", q], queryFn: () => apiGet<any>(`/api/clients?q=${encodeURIComponent(q)}`) });

  const create = useMutation({
    mutationFn: (v: any) => apiSend("/api/clients", "POST", v),
    onSuccess: () => { toast.success("Client added"); qc.invalidateQueries({ queryKey: ["clients"] }); reset(); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" className="pl-9" />
        </div>
        {can("Client.Create") && <Button onClick={() => setOpen(true)}><Plus className="size-4" /> New client</Button>}
      </div>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.clients.map((c: any, i: number) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="h-full p-5">
                <div className="flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="size-5" /></div>
                  <Badge color={STATUS[c.status]}>{c.status}</Badge>
                </div>
                <h3 className="mt-3 font-semibold">{c.company}</h3>
                <p className="text-xs text-muted-foreground">{c.industry ?? "—"}</p>
                {c.contactPerson && <p className="mt-2 text-sm">{c.contactPerson}</p>}
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {c.email && <div className="flex items-center gap-1.5"><Mail className="size-3" /> {c.email}</div>}
                  {c.phone && <div className="flex items-center gap-1.5"><Phone className="size-3" /> {c.phone}</div>}
                </div>
                <div className="mt-3 flex gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{c._count.projects} projects</span>
                  <span>{c._count.tasks} tasks</span>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="New client" className="max-w-lg">
        <form onSubmit={handleSubmit((v) => create.mutate(v))} className="space-y-4">
          <div className="space-y-1.5"><Label>Company</Label><Input {...register("company", { required: true })} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Contact person</Label><Input {...register("contactPerson")} /></div>
            <div className="space-y-1.5"><Label>Industry</Label><Input {...register("industry")} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" {...register("email")} /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input {...register("phone")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select {...register("status")} defaultValue="ACTIVE">
              {Object.keys(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea {...register("notes")} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending && <Loader2 className="size-4 animate-spin" />} Create</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
