/**
 * Refresh the access token once, sharing a single in-flight request so a burst
 * of parallel 401s does not rotate the refresh token several times over (each
 * rotation revokes the previous one, so concurrent calls would log the user out).
 */
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession() {
  refreshInFlight ??= fetch("/api/auth/refresh", { method: "POST" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Run a request, and on 401 refresh the session once and retry. */
async function withRetry(run: () => Promise<Response>): Promise<Response> {
  const res = await run();
  if (res.status !== 401) return res;
  const refreshed = await refreshSession();
  if (!refreshed) {
    // Refresh window has genuinely expired — send the user to sign in again.
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = `/login?from=${encodeURIComponent(
        window.location.pathname + window.location.search
      )}`;
    }
    return res;
  }
  return run();
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await withRetry(() => fetch(url));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function apiSend<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown
): Promise<T> {
  const res = await withRetry(() =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}
