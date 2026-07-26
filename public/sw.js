/* Elenor OS service worker — Web Push delivery.
 *
 * Payload contract (see src/lib/push.ts PushPayload):
 *   { id, type, title, body, taskId, assignedBy, createdAt, url, silent }
 */

// Activate a new worker immediately rather than waiting for tabs to close.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Elenor OS", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Elenor OS";
  const url = data.url || "/dashboard";

  const options = {
    body: data.body || "",
    icon: "/icons/notification-192.png",
    badge: "/icons/badge-72.png",
    // Same tag replaces an existing notification instead of stacking a
    // duplicate — this is the dedup mechanism.
    tag: data.id || `${data.type || "generic"}:${url}`,
    renotify: false,
    silent: Boolean(data.silent),
    timestamp: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
    requireInteraction: false,
    data: { url, taskId: data.taskId, type: data.type, id: data.id },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Nudge any open tab to refetch the bell so the unread count updates
      // immediately instead of waiting for the next poll.
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        client.postMessage({ type: "NOTIFICATION_RECEIVED" });
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";
  const absolute = new URL(targetUrl, self.location.origin);

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Prefer focusing a tab already on this origin and navigating it, so we
      // never pile up duplicate tabs of the app.
      for (const client of clientList) {
        if (new URL(client.url).origin !== absolute.origin) continue;
        await client.focus();
        if ("navigate" in client && client.url !== absolute.href) {
          try {
            await client.navigate(absolute.href);
          } catch {
            // Navigation can be refused (e.g. cross-document); tell the page to
            // route client-side instead.
            client.postMessage({ type: "NOTIFICATION_NAVIGATE", url: targetUrl });
          }
        } else {
          client.postMessage({ type: "NOTIFICATION_NAVIGATE", url: targetUrl });
        }
        return;
      }

      // No open tab — open one.
      await self.clients.openWindow(absolute.href);
    })()
  );
});

// Browsers rotate push endpoints; re-register transparently when they do.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const applicationServerKey =
        (event.oldSubscription && event.oldSubscription.options &&
          event.oldSubscription.options.applicationServerKey) || undefined;
      if (!applicationServerKey) return;
      try {
        const sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      } catch (e) {
        // Nothing more we can do from here; the page re-subscribes on next load.
      }
    })()
  );
});
