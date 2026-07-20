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
