"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, Moon, Sun, Monitor, Eye, EyeOff, Check, KeyRound } from "lucide-react";
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
import { PushSettingsCard } from "@/components/shell/push-settings";
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

      <PushSettingsCard />

      <ChangePasswordCard />

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

const PASSWORD_RULES = [
  { label: "At least 10 characters", test: (v: string) => v.length >= 10 },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
];

function ChangePasswordCard() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);

  const rules = PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(next) }));
  const strong = rules.every((r) => r.ok);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && strong && matches;

  const change = useMutation({
    mutationFn: () =>
      apiSend("/api/auth/change-password", "POST", { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success("Password updated. Other devices have been signed out.");
      setCurrent(""); setNext(""); setConfirm("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Password</CardTitle></CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) change.mutate(); }}
        >
          <input type="text" name="username" autoComplete="username" className="hidden" />

          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                className="pr-9"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {next.length > 0 && (
            <ul className="grid gap-1 sm:grid-cols-2">
              {rules.map((r) => (
                <li
                  key={r.label}
                  className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  <Check className={`size-3.5 ${r.ok ? "opacity-100" : "opacity-30"}`} /> {r.label}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && !matches && (
              <p className="text-xs text-destructive">Passwords do not match.</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">
              Changing your password signs you out of all other devices.
            </p>
            <Button type="submit" disabled={!canSubmit || change.isPending}>
              {change.isPending && <Loader2 className="size-4 animate-spin" />} Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
