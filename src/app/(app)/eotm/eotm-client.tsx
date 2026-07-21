"use client";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Trophy, Medal, Crown, Settings2, Loader2, Sparkles } from "lucide-react";
import { apiGet, apiSend } from "@/lib/fetcher";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/components/session-context";

const COMPONENTS = [
  { key: "taskCompletion", label: "Task completion", weight: "taskCompletionWeight" },
  { key: "deadline", label: "Deadline adherence", weight: "deadlineWeight" },
  { key: "quality", label: "Quality", weight: "qualityWeight" },
  { key: "attendance", label: "Attendance", weight: "attendanceWeight" },
  { key: "collaboration", label: "Collaboration", weight: "collaborationWeight" },
  { key: "initiative", label: "Initiative", weight: "initiativeWeight" },
] as const;

export function EotmClient() {
  const can = useCan();
  const qc = useQueryClient();
  const canManage = can("Eotm.Manage");
  const [cfgOpen, setCfgOpen] = React.useState(false);
  const [overrideFor, setOverrideFor] = React.useState<any>(null);

  const { data, isLoading } = useQuery({ queryKey: ["eotm"], queryFn: () => apiGet<any>("/api/eotm") });

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-96 rounded-xl" /></div>;
  }

  const podium = data.leaderboard.slice(0, 3);
  const rest = data.leaderboard.slice(3);

  return (
    <div className="space-y-6">
      {/* winner hero */}
      {data.winner && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/15 via-primary/5 to-transparent p-6">
            <Sparkles className="absolute right-6 top-6 size-20 text-warning/10" />
            <div className="flex flex-wrap items-center gap-5">
              <div className="relative">
                <Avatar firstName={data.winner.user.firstName} lastName={data.winner.user.lastName} src={data.winner.user.avatarUrl} size={72} />
                <div className="absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full bg-warning text-white"><Crown className="size-4" /></div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-warning">Employee of the Month · {data.period}</div>
                <div className="text-2xl font-bold">{data.winner.user.firstName} {data.winner.user.lastName}</div>
                <div className="text-sm text-muted-foreground">{data.winner.user.jobTitle ?? data.winner.user.role?.name}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge color="#F59E0B">Score {data.winner.total}</Badge>
                  {data.winner.overridden && <Badge color="#8B5CF6">Manager pick</Badge>}
                  {data.winner.reward && <Badge color="#22C55E">🎁 {data.winner.reward}</Badge>}
                </div>
                {data.winner.justification && <p className="mt-2 max-w-lg text-sm italic text-muted-foreground">&ldquo;{data.winner.justification}&rdquo;</p>}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {canManage && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setCfgOpen(true)}><Settings2 className="size-4" /> Scoring weights</Button>
        </div>
      )}

      {/* podium */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {podium.map((p: any) => (
          <Card key={p.userId} className={`p-4 text-center ${p.rank === 1 ? "ring-2 ring-warning/40" : ""}`}>
            <div className="mx-auto flex size-8 items-center justify-center rounded-full" style={{ backgroundColor: p.rank === 1 ? "#F59E0B22" : "#64748B22" }}>
              {p.rank === 1 ? <Trophy className="size-4 text-warning" /> : <Medal className="size-4 text-muted-foreground" />}
            </div>
            <div className="mt-2 flex justify-center"><Avatar firstName={p.user?.firstName} lastName={p.user?.lastName} src={p.user?.avatarUrl} size={48} /></div>
            <div className="mt-2 font-semibold">{p.user?.firstName} {p.user?.lastName}</div>
            <div className="text-xs text-muted-foreground">{p.user?.jobTitle}</div>
            <div className="mt-1 text-lg font-bold text-primary">{p.total}</div>
            {canManage && p.rank !== 1 && (
              <Button size="sm" variant="ghost" className="mt-1 text-xs" onClick={() => setOverrideFor({ ...p, period: data.period })}>Make winner</Button>
            )}
          </Card>
        ))}
      </div>

      {/* leaderboard */}
      <Card>
        <CardHeader><CardTitle>Leaderboard · {data.period}</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {data.leaderboard.map((p: any) => (
            <div key={p.userId} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
              <span className="w-6 text-center text-sm font-semibold text-muted-foreground">{p.rank}</span>
              <Avatar firstName={p.user?.firstName} lastName={p.user?.lastName} src={p.user?.avatarUrl} size={34} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p.user?.firstName} {p.user?.lastName}</div>
                <div className="mt-1 hidden gap-1 sm:flex">
                  {COMPONENTS.map((c) => (
                    <div key={c.key} className="flex-1" title={`${c.label}: ${p[c.key]}`}>
                      <Progress value={p[c.key]} className="h-1" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">{p.total}</div>
              </div>
              {canManage && p.rank !== 1 && (
                <Button size="sm" variant="ghost" onClick={() => setOverrideFor({ ...p, period: data.period })}>Override</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* hall of fame */}
      {data.hallOfFame.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Crown className="size-4 text-warning" /> Hall of Fame</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.hallOfFame.map((w: any) => (
                <div key={w.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Avatar firstName={w.user.firstName} lastName={w.user.lastName} src={w.user.avatarUrl} size={30} />
                  <div>
                    <div className="text-sm font-medium">{w.user.firstName} {w.user.lastName}</div>
                    <div className="text-xs text-muted-foreground">{w.period}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {canManage && <WeightsDialog open={cfgOpen} onClose={() => setCfgOpen(false)} config={data.config} />}
      {canManage && overrideFor && <OverrideDialog data={overrideFor} onClose={() => setOverrideFor(null)} />}
    </div>
  );
}

function WeightsDialog({ open, onClose, config }: { open: boolean; onClose: () => void; config: any }) {
  const qc = useQueryClient();
  const [weights, setWeights] = React.useState<Record<string, number>>({});
  React.useEffect(() => { if (config) setWeights({ ...config }); }, [config]);

  const save = useMutation({
    mutationFn: () => apiSend("/api/eotm/override", "PATCH", {
      taskCompletionWeight: Number(weights.taskCompletionWeight),
      deadlineWeight: Number(weights.deadlineWeight),
      qualityWeight: Number(weights.qualityWeight),
      attendanceWeight: Number(weights.attendanceWeight),
      collaborationWeight: Number(weights.collaborationWeight),
      initiativeWeight: Number(weights.initiativeWeight),
    }),
    onSuccess: () => { toast.success("Weights updated"); qc.invalidateQueries({ queryKey: ["eotm"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = COMPONENTS.reduce((s, c) => s + (Number(weights[c.weight]) || 0), 0);

  return (
    <Dialog open={open} onClose={onClose} title="Scoring weights" description="Adjust how the monthly score is calculated.">
      <div className="space-y-3">
        {COMPONENTS.map((c) => (
          <div key={c.key} className="flex items-center gap-3">
            <Label className="flex-1">{c.label}</Label>
            <Input type="number" className="w-20" value={weights[c.weight] ?? 0}
              onChange={(e) => setWeights((w) => ({ ...w, [c.weight]: Number(e.target.value) }))} />
            <span className="w-6 text-xs text-muted-foreground">%</span>
          </div>
        ))}
        <div className={`text-sm ${total === 100 ? "text-success" : "text-warning"}`}>Total: {total}% {total !== 100 && "(should be 100)"}</div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />} Save</Button>
        </div>
      </div>
    </Dialog>
  );
}

function OverrideDialog({ data, onClose }: { data: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [justification, setJustification] = React.useState("");
  const [reward, setReward] = React.useState("");
  const save = useMutation({
    mutationFn: () => apiSend("/api/eotm/override", "POST", { period: data.period, userId: data.userId, justification, reward }),
    onSuccess: () => { toast.success("Winner overridden"); qc.invalidateQueries({ queryKey: ["eotm"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onClose={onClose} title="Override winner" description={`Set ${data.user?.firstName} ${data.user?.lastName} as Employee of the Month.`}>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label>Justification</Label><Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Why this override?" /></div>
        <div className="space-y-1.5"><Label>Reward (optional)</Label><Input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="e.g. Bonus day off" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!justification || save.isPending}>{save.isPending && <Loader2 className="size-4 animate-spin" />} Confirm</Button>
        </div>
      </div>
    </Dialog>
  );
}
