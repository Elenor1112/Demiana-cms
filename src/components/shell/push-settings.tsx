"use client";
import * as React from "react";
import { toast } from "sonner";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePush } from "@/lib/use-push";

export function PushSettingsCard() {
  const { state, busy, subscribed, enable, disable, sendTest } = usePush();

  const copy: Record<typeof state, string> = {
    unsupported: "This browser does not support push notifications. On iPhone, add Elenor OS to your Home Screen first.",
    unconfigured: "Push notifications are not configured on the server yet. Ask an administrator to set the VAPID keys.",
    denied: "Notifications are blocked. Enable them for this site in your browser's site settings, then reload.",
    default: "Get notified about task assignments, mentions and approvals even when Elenor OS is closed.",
    granted: subscribed
      ? "Browser notifications are on for this device."
      : "Permission granted — finishing setup…",
  };

  const actionable = state === "default" || (state === "granted" && !subscribed);

  return (
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              {state === "granted" && subscribed ? (
                <Bell className="size-4 text-primary" />
              ) : (
                <BellOff className="size-4 text-muted-foreground" />
              )}
              Browser notifications
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{copy[state]}</p>
          </div>

          <div className="flex shrink-0 gap-2">
            {actionable && (
              <Button
                onClick={async () => {
                  const ok = await enable();
                  toast[ok ? "success" : "error"](
                    ok ? "Browser notifications enabled" : "Could not enable notifications"
                  );
                }}
                disabled={busy}
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Enable
              </Button>
            )}
            {state === "granted" && subscribed && (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const r = await sendTest();
                    if (r?.sent) toast.success("Test notification sent");
                    else toast.error("No device received it — try re-enabling.");
                  }}
                  disabled={busy}
                >
                  Send test
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await disable();
                    toast.success("Turned off for this device");
                  }}
                  disabled={busy}
                >
                  Turn off
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
