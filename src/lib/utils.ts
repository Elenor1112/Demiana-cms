import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(first?: string | null, last?: string | null) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function fullName(u: { firstName?: string | null; lastName?: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown";
}

const dtf = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export function formatDate(d?: Date | string | null) {
  if (!d) return "—";
  return dtf.format(new Date(d));
}

/**
 * Format a date for an <input type="date"> value (yyyy-MM-dd).
 * Uses local date parts rather than toISOString(), which would shift the day
 * for timezones behind UTC.
 */
export function toDateInputValue(d?: Date | string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dtfTime = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit",
});
const dtfTimeOnly = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * Format a date, including the time when one was actually set.
 *
 * Deadlines created before time-of-day support (and date-only entries) land on
 * local midnight; showing "12:00 AM" for those would be noise, so midnight
 * renders as date-only.
 */
export function formatDateTime(d?: Date | string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  const midnight = date.getHours() === 0 && date.getMinutes() === 0;
  return midnight ? dtf.format(date) : dtfTime.format(date);
}

/** Just the clock portion, or "" when the deadline is date-only. */
export function formatTimeOnly(d?: Date | string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  if (date.getHours() === 0 && date.getMinutes() === 0) return "";
  return dtfTimeOnly.format(date);
}

/**
 * Format a date for an <input type="datetime-local"> value (yyyy-MM-ddTHH:mm).
 * Local parts, for the same timezone reason as toDateInputValue.
 */
export function toDateTimeInputValue(d?: Date | string | null) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The canonical timestamp format for activity timelines: 7/27/2026, 12:19 PM.
 *
 * Used by task activity, comments, audit logs and notification history so those
 * surfaces never mix relative and absolute time. Unlike formatDateTime, this
 * always shows the clock — an event at local midnight really did happen at
 * 12:00 AM, whereas a date-only *deadline* means "end of day" and should stay
 * date-only.
 *
 * Locale and timezone come from the runtime (undefined locale = the user's own),
 * so this follows the viewer's regional settings.
 */
const dtfExact = new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "numeric", day: "numeric",
  hour: "numeric", minute: "2-digit",
});
export function formatExactDateTime(d?: Date | string | null) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return dtfExact.format(date);
}

export function relativeTime(d?: Date | string | null) {
  if (!d) return "";
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const s = Math.round(diff / 1000);
  const m = Math.round(s / 60);
  const h = Math.round(m / 60);
  const day = Math.round(h / 24);
  if (s < 60) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return formatDate(date);
}

export function businessDaysBetween(start: Date, end: Date) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Avatar background from a string (deterministic)
export function avatarColor(seed: string) {
  const colors = [
    "#06B6D4", "#0EA5E9", "#8B5CF6", "#EC4899",
    "#F59E0B", "#22C55E", "#EF4444", "#14B8A6",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
