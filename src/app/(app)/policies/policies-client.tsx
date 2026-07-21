"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { BookOpen, ChevronDown, CheckCircle2, ShieldAlert } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WARNING_META } from "@/lib/constants";

export function PoliciesClient() {
  const qc = useQueryClient();
  const [openId, setOpenId] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["policies"], queryFn: () => apiGet<any>("/api/policies") });

  const ack = useMutation({
    mutationFn: (id: string) => apiSend(`/api/policies/${id}/ack`, "POST"),
    onSuccess: () => { toast.success("Policy acknowledged"); qc.invalidateQueries({ queryKey: ["policies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const categories = Array.from(new Set(data.policies.map((p: any) => p.category)));
  const needsAck = data.policies.filter((p: any) => p.requiresAck && !p.acknowledged).length;

  return (
    <div className="space-y-5">
      {needsAck > 0 && (
        <Card className="flex items-center gap-3 border-warning/30 bg-warning/5 p-4">
          <ShieldAlert className="size-5 text-warning" />
          <span className="text-sm">You have <strong>{needsAck}</strong> polic{needsAck === 1 ? "y" : "ies"} requiring acknowledgment.</span>
        </Card>
      )}

      {/* card system callout */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-semibold">Disciplinary Card System</div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(WARNING_META).map(([k, m]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
              <span className="size-3 rounded-full" style={{ backgroundColor: m.color }} />
              <strong>{m.label}</strong><span className="text-muted-foreground">{m.note}</span>
            </div>
          ))}
        </div>
      </Card>

      {categories.map((cat: any) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</div>
          <div className="space-y-2">
            {data.policies.filter((p: any) => p.category === cat).map((p: any) => (
              <Card key={p.id} className="overflow-hidden">
                <button onClick={() => setOpenId(openId === p.id ? null : p.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{p.title}</span>
                  {p.requiresAck && (p.acknowledged
                    ? <Badge color="#22C55E"><CheckCircle2 className="size-3" /> Acknowledged</Badge>
                    : <Badge color="#F59E0B">Needs acknowledgment</Badge>)}
                  <ChevronDown className={`size-4 text-muted-foreground transition-transform ${openId === p.id ? "rotate-180" : ""}`} />
                </button>
                <AnimatePresence>
                  {openId === p.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="border-t border-border px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm text-foreground/90">{p.body}</p>
                        {p.requiresAck && !p.acknowledged && (
                          <Button size="sm" className="mt-3" onClick={() => ack.mutate(p.id)} disabled={ack.isPending}>
                            <CheckCircle2 className="size-4" /> I acknowledge this policy
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
