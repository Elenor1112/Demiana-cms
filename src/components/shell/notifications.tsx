"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Bell, Check, BellRing, Trash2 } from "lucide-react";
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
   * Restore a dismissed notification (Undo).
   *
   * Puts the row back at its original position — the list is ordered by
   * createdAt, so re-sorting after insert lands it exactly where it was rather
   * than at the top.
   */
  const restore = useMutation({
    mutationFn: (n: Notif) =>
      fetch(`/api/notifications/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: false }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to restore notification");
        return res.json();
      }),
    onMutate: async (n: Notif) => {
      await qc.cancelQueries({ queryKey: FEED_KEY });
      const previous = qc.getQueryData<NotifFeed>(FEED_KEY);
      qc.setQueryData<NotifFeed>(FEED_KEY, (old) => {
        if (!old) return old;
        if (old.notifications.some((x) => x.id === n.id)) return old; // already back
        return {
          notifications: [...old.notifications, n].sort(
            (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
          ),
          unread: old.unread + (n.read ? 0 : 1),
        };
      });
      return { previous };
    },
    onError: (_err, _n, ctx) => {
      if (ctx?.previous) qc.setQueryData(FEED_KEY, ctx.previous);
      toast.error("Could not restore the notification");
      qc.invalidateQueries({ queryKey: FEED_KEY });
    },
  });

  /**
   * Dismiss (soft delete) one notification.
   *
   * Removed from the cache immediately so the row animates out and the badge
   * drops on the same frame; the server call follows. An unread row also
   * decrements `unread`, which is what keeps the badge honest. On failure the
   * whole previous feed is restored and the user is told.
   */
  const dismiss = useMutation({
    mutationFn: (n: Notif) =>
      fetch(`/api/notifications/${n.id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete notification");
        return res.json();
      }),
    onMutate: async (n: Notif) => {
      await qc.cancelQueries({ queryKey: FEED_KEY });
      const previous = qc.getQueryData<NotifFeed>(FEED_KEY);
      qc.setQueryData<NotifFeed>(FEED_KEY, (old) => {
        if (!old) return old;
        const target = old.notifications.find((x) => x.id === n.id);
        if (!target) return old;
        return {
          notifications: old.notifications.filter((x) => x.id !== n.id),
          // Only an unread row was contributing to the badge.
          unread: target.read ? old.unread : Math.max(0, old.unread - 1),
        };
      });
      return { previous };
    },
    onSuccess: (_res, n) => {
      // Undo rather than a confirm dialog — the row is soft-deleted, so putting
      // it back is a single write.
      toast.success("Notification deleted", {
        action: { label: "Undo", onClick: () => restore.mutate(n) },
      });
    },
    onError: (_err, _n, ctx) => {
      if (ctx?.previous) qc.setQueryData(FEED_KEY, ctx.previous);
      toast.error("Could not delete the notification");
      qc.invalidateQueries({ queryKey: FEED_KEY });
    },
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

  /**
   * Delete handler. Same in-flight guard as above so a double click sends one
   * request; the optimistic removal makes a second click impossible anyway once
   * React has re-rendered, but the events can land in the same frame.
   */
  const deleting = React.useRef(new Set<string>());
  function deleteNotification(e: React.MouseEvent, n: Notif) {
    // The row is a Link/button — stop the click from navigating or marking read.
    e.preventDefault();
    e.stopPropagation();
    if (deleting.current.has(n.id)) return;
    deleting.current.add(n.id);
    dismiss.mutate(n, { onSettled: () => deleting.current.delete(n.id) });
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
                // initial={false} so the list does not animate in on open —
                // only deletions animate out.
                <AnimatePresence initial={false}>
                {data.notifications.map((n) => {
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
                      {/* pr-7 reserves the trash button's width, so revealing it
                          on hover never reflows the text beside it. */}
                      <div className="min-w-0 flex-1 pr-7">
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
                  const row = n.link ? (
                    <Link
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
                      type="button"
                      onClick={() => openNotification(n)}
                      className="block w-full text-left"
                    >
                      {body}
                    </button>
                  );

                  return (
                    <motion.div
                      key={n.id}
                      // Collapsing height (not just opacity) is what pulls the
                      // rows below upward. No `layout` prop: the height collapse
                      // already produces the shift, and layout animations inside
                      // a scroll container fight with the scroll position.
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="group relative overflow-hidden"
                    >
                      {row}
                      {/* Hover-revealed delete. Sits above the row rather than
                          inside it, so a Link cannot swallow the click. It also
                          reveals on focus-visible, so it is keyboard-reachable
                          without a pointer. */}
                      <button
                        type="button"
                        aria-label="Delete notification"
                        title="Delete notification"
                        onClick={(e) => deleteNotification(e, n)}
                        className="absolute right-2 top-2.5 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all duration-150 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
