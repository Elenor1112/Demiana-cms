"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

/** Remembers that we already asked, so we never re-prompt an ignoring user. */
const ASKED_KEY = "elenor_push_asked";

export type PushState =
  | "unsupported" // browser has no Push API (e.g. iOS Safari outside a PWA)
  | "unconfigured" // server has no VAPID keys
  | "default" // supported, not yet asked
  | "granted"
  | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Registers the service worker, tracks permission state, and subscribes the
 * browser to Web Push.
 *
 * Deliberately does NOT auto-prompt: browsers penalise sites that request
 * notification permission on load, and Chrome blocks the prompt entirely
 * without a user gesture. `enable()` is wired to an explicit button.
 */
export function usePush() {
  const router = useRouter();
  const [state, setState] = React.useState<PushState>("default");
  const [busy, setBusy] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);

  // Register the worker and re-sync an existing subscription on mount.
  React.useEffect(() => {
    if (!isSupported()) {
      setState("unsupported");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const permission = Notification.permission as NotificationPermission;
        if (cancelled) return;

        if (permission === "denied") {
          setState("denied");
          return;
        }

        const existing = await reg.pushManager.getSubscription();
        if (cancelled) return;
        setSubscribed(Boolean(existing));

        if (permission === "granted") {
          setState("granted");
          // Re-post the subscription so a rotated endpoint or a new user on this
          // device is reconciled server-side.
          if (existing) {
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(existing),
            }).catch(() => {});
          } else {
            await subscribe(reg);
          }
        } else {
          setState("default");
        }
      } catch (e) {
        console.error("[push] registration failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Let the service worker drive client-side navigation on notification click.
  React.useEffect(() => {
    if (!isSupported()) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "NOTIFICATION_NAVIGATE" && event.data.url) {
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  async function subscribe(reg: ServiceWorkerRegistration) {
    const keyRes = await fetch("/api/push/public-key");
    if (!keyRes.ok) return false;
    const { publicKey, configured } = await keyRes.json();
    if (!configured || !publicKey) {
      setState("unconfigured");
      return false;
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    });
    if (!res.ok) return false;
    setSubscribed(true);
    return true;
  }

  /** Call from a click handler — browsers require a user gesture. */
  const enable = React.useCallback(async () => {
    if (!isSupported()) return false;
    setBusy(true);
    try {
      localStorage.setItem(ASKED_KEY, "1");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "default");
        return false;
      }
      setState("granted");
      const reg = await navigator.serviceWorker.ready;
      return await subscribe(reg);
    } catch (e) {
      console.error("[push] enable failed", e);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = React.useCallback(async () => {
    if (!isSupported()) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = React.useCallback(async () => {
    const res = await fetch("/api/push/test", { method: "POST" });
    return res.ok ? res.json() : null;
  }, []);

  /** True once the user has been prompted at least once on this device. */
  const alreadyAsked =
    typeof window !== "undefined" && localStorage.getItem(ASKED_KEY) === "1";

  return { state, busy, subscribed, enable, disable, sendTest, alreadyAsked };
}
