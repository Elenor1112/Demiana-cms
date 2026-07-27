"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, BellRing } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { usePush } from "@/lib/use-push";

type Notif = {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  read: boolean;
  readAt?: string | null;
  createdAt: string;
};

type NotifFeed = { notifications: Notif[]; unread: number };

const FEED_KEY = ["notifications"] as const;

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const push = usePush();

  const { data } = useQuery({
    queryKey: FEED_KEY,
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) return { notifications: [], unread: 0 };
      return res.json() as Promise<NotifFeed>;
    },
    refetchInterval: 20_000,
    // Reading a notification in another tab should clear this tab's badge as
    // soon as it is looked at, rather than up to 20s later. Needs staleTime 0 to
    // beat the 30s global default, which would otherwise swallow the refetch.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  /**
   * Mark one notification read.
   *
   * The cache is patched optimistically so the dot and the badge clear on the
   * same frame as the click — navigation happens immediately after, and waiting
   * for the round trip would leave a stale badge on the destination page. On
   * failure the previous cache is restored and a refetch reconciles with the
   * server; other open tabs pick the change up on their next poll.
   */
  const markRead = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to mark notification read");
        return res.json();
      }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: FEED_KEY });
      const previous = qc.getQueryData<NotifFeed>(FEED_KEY);
      qc.setQueryData<NotifFeed>(FEED_KEY, (old) => {
        if (!old) return old;
        const target = old.notifications.find((n) => n.id === id);
        if (!target || target.read) return old; // already read — nothing to change
        return {
          notifications: old.notifications.map((n) =>
            n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n
          ),
          unread: Math.max(0, old.unread - 1),
        };
      });
      return { previous };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(FEED_KEY, ctx.previous);
      qc.invalidateQueries({ queryKey: FEED_KEY });
    },
    // No invalidate on success: the optimistic patch already matches the server,
    // and the 20s poll reconciles anything else.
  });

  /**
   * Click handler shared by linked and unlinked rows.
   *
   * `n.read` alone would not stop a double click — React can hand both events
   * the same pre-optimistic props — so ids already in flight are tracked
   * separately in a ref.
   */
  const inFlight = React.useRef(new Set<string>());
  function openNotification(n: Notif) {
    if (n.read || inFlight.current.has(n.id)) return;
    inFlight.current.add(n.id);
    markRead.mutate(n.id, {
      onSettled: () => inFlight.current.delete(n.id),
    });
  }

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // A push arriving refreshes the bell immediately rather than after the poll.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_RECEIVED") {
        qc.invalidateQueries({ queryKey: FEED_KEY });
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [qc]);

  async function markAll() {
    const previous = qc.getQueryData<NotifFeed>(FEED_KEY);
    const readAt = new Date().toISOString();
    qc.setQueryData<NotifFeed>(FEED_KEY, (old) =>
      old
        ? {
            notifications: old.notifications.map((n) =>
              n.read ? n : { ...n, read: true, readAt }
            ),
            unread: 0,
          }
        : old
    );
    const res = await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => null);
    if (!res?.ok && previous) qc.setQueryData(FEED_KEY, previous);
    qc.invalidateQueries({ queryKey: FEED_KEY });
  }

  const unread = data?.unread ?? 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button
                  onClick={markAll}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Check className="size-3" /> Mark all read
                </button>
              )}
            </div>
            {push.state === "default" && (
              <button
                onClick={async () => {
                  await push.enable();
                }}
                disabled={push.busy}
                className="flex w-full items-center gap-2 border-b border-border bg-primary/5 px-4 py-2.5 text-left text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                <BellRing className="size-3.5 shrink-0" />
                <span>Turn on browser notifications for tasks &amp; mentions</span>
              </button>
            )}
            <div className="max-h-96 overflow-y-auto">
              {!data?.notifications?.length ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  You&apos;re all caught up 🎉
                </div>
              ) : (
                data.notifications.map((n) => {
                  const body = (
                    <div
                      className={`flex gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-accent/50 ${
                        !n.read ? "bg-primary/5" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          n.read ? "bg-transparent" : "bg-primary"
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight">{n.title}</div>
                        {n.body && (
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </div>
                        )}
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </div>
                      </div>
                    </div>
                  );
                  // A link is followed regardless of whether the target still
                  // exists — the destination page renders its own not-found
                  // state, and the notification stays read either way, matching
                  // how Slack and Linear behave.
                  return n.link ? (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => {
                        openNotification(n);
                        setOpen(false);
                      }}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => openNotification(n)}
                      className="block w-full text-left"
                    >
                      {body}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
