"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, Moon, Sun, Monitor } from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/components/session-context";
import { useTheme } from "@/components/theme-provider";
import { ROLE_META } from "@/lib/rbac";

export function SettingsClient() {
  const me = useSession();
  const { theme, setTheme } = useTheme();
  const [resignOpen, setResignOpen] = React.useState(false);

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar firstName={me.firstName} lastName={me.lastName} size={64} />
            <div>
              <div className="text-lg font-semibold">{me.firstName} {me.lastName}</div>
              <div className="text-sm text-muted-foreground">{me.email}</div>
              <div className="mt-1"><Badge color="#06B6D4">{ROLE_META[me.roleKey].name}</Badge></div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {[
              { key: "light" as const, label: "Light", icon: Sun },
              { key: "dark" as const, label: "Dark", icon: Moon },
            ].map((t) => (
              <button key={t.key} onClick={() => setTheme(t.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${theme === t.key ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>
                <t.icon className="size-4" /> {t.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader><CardTitle className="text-destructive">Danger zone</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Submit resignation</div>
              <div className="text-sm text-muted-foreground">Starts the offboarding approval workflow.</div>
            </div>
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setResignOpen(true)}>
              <LogOut className="size-4" /> Resign
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResignDialog open={resignOpen} onClose={() => setResignOpen(false)} />
    </div>
  );
}

function ResignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = React.useState("");
  const [lastDay, setLastDay] = React.useState("");
  const submit = useMutation({
    mutationFn: () => apiSend("/api/resignations", "POST", { reason, lastWorkingDay: lastDay }),
    onSuccess: () => { toast.success("Resignation submitted"); qc.invalidateQueries({ queryKey: ["approvals"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Submit resignation" description="This begins the formal offboarding process.">
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Reason</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for resignation…" /></div>
        <div className="space-y-1.5"><Label>Last working day</Label><Input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-destructive hover:bg-destructive/90" onClick={() => submit.mutate()} disabled={!reason || !lastDay || submit.isPending}>
            {submit.isPending && <Loader2 className="size-4 animate-spin" />} Submit resignation
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
