/**
 * Timezone handling for user-entered dates and times.
 *
 * ── The problem this solves ───────────────────────────────────
 * Users pick a wall-clock time ("1:30 PM on 27 Jul"). That string carries no
 * zone, so turning it into an instant requires knowing WHICH zone it was meant
 * in. `new Date("2026-07-27T13:30")` resolves it in the *runtime's* zone —
 * which is the developer's laptop locally, but UTC on Vercel. The same input
 * therefore produced different instants in dev and in production, and Cairo
 * users saw their deadlines three hours late.
 *
 * The fix is to resolve wall-clock input against the *company's* timezone
 * (APP_TIMEZONE) rather than whatever zone the server process happens to run
 * in. Storage stays UTC (timestamptz); only the interpretation of ambiguous
 * user input is pinned.
 *
 * ── Why not just add/subtract hours ───────────────────────────
 * A fixed offset is wrong twice a year. Egypt observes DST (UTC+2 winter,
 * UTC+3 summer), so the offset is derived from the IANA database via Intl for
 * the specific date being converted, never hardcoded.
 */

/**
 * The timezone the business operates in. Wall-clock input with no zone is
 * interpreted here. Override with APP_TIMEZONE to relocate or to run tests.
 */
// NEXT_PUBLIC_ is checked FIRST and is the only one that reaches the browser.
// A server-only APP_TIMEZONE would leave the client on the fallback, so the two
// would disagree and re-introduce a split — hence public first, and identical
// defaults on both sides. Next.js inlines this at build time.
export const APP_TIMEZONE =
  process.env.NEXT_PUBLIC_APP_TIMEZONE ??
  process.env.APP_TIMEZONE ??
  "Africa/Cairo";

/**
 * The offset of `timeZone` at a given instant, in minutes east of UTC.
 * Derived from the IANA rules, so DST is handled for the date in question.
 */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  // "en-US" + longOffset yields e.g. "GMT+03:00"; formatToParts avoids having
  // to parse a whole formatted date string.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(instant);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0; // "GMT" exactly => UTC
  const [, sign, hh, mm = "00"] = m;
  const mins = Number(hh) * 60 + Number(mm);
  return sign === "-" ? -mins : mins;
}

/**
 * Turn wall-clock parts into the UTC instant at which they occur in `timeZone`.
 *
 * Solved by iteration rather than algebra: the offset depends on the instant,
 * and the instant depends on the offset. One correction pass converges for all
 * real zones; a second guards the rare case where the first guess lands on the
 * far side of a DST transition.
 */
function zonedPartsToUtc(
  y: number, mo: number, d: number, h: number, mi: number, s: number,
  timeZone: string
): Date {
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s, 0);
  let instant = new Date(asUtc - offsetMinutesAt(new Date(asUtc), timeZone) * 60_000);
  instant = new Date(asUtc - offsetMinutesAt(instant, timeZone) * 60_000);
  return instant;
}

/** Wall-clock field values of `instant` as seen in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // hour12:false can render midnight as 24; normalise it.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/**
 * Parse user-entered date/time into the correct instant.
 *
 * Accepts:
 *   "2026-07-27"        → midnight in APP_TIMEZONE (date-only)
 *   "2026-07-27T13:30"  → 13:30 in APP_TIMEZONE
 *   a full ISO string with an explicit zone → respected as-is
 *
 * Returns null for unparseable input so callers can reject rather than store
 * an Invalid Date.
 */
export function parseUserDateTime(
  input: string,
  timeZone: string = APP_TIMEZONE
): Date | null {
  const raw = input?.trim();
  if (!raw) return null;

  // Already carries a zone (…Z or ±HH:MM) — it is an unambiguous instant.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return zonedPartsToUtc(+y, +mo, +d, +h, +mi, +s, timeZone);
}

/**
 * Same as parseUserDateTime, for fields that are required.
 *
 * Throws instead of returning null so a malformed date surfaces as a clear
 * error rather than being stored as an Invalid Date (which Postgres rejects
 * with a far less helpful message). `field` names the offending input.
 */
export function requireUserDateTime(
  input: string,
  field = "date",
  timeZone: string = APP_TIMEZONE
): Date {
  const d = parseUserDateTime(input, timeZone);
  if (!d) throw new InvalidDateError(`${field}: invalid date/time "${input}"`);
  return d;
}

/** Bad user-supplied date. Mapped to a 400 by toErrorResponse. */
export class InvalidDateError extends Error {}

/**
 * "yyyy-MM-dd" for today as seen in APP_TIMEZONE.
 *
 * The `min` attribute for every scheduling date input, and the boundary the
 * server validates against. Derived from the company zone rather than the
 * runtime's: on a UTC host, "today" flips at 22:00 Cairo time, which would
 * start rejecting the rest of the working day as "in the past".
 */
export function companyToday(timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(new Date(), timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Whether a wall-clock input falls before today in the company's zone.
 *
 * Compared at DAY granularity on purpose: a deadline of "today at 09:00" set at
 * 11:00 is a normal same-day entry, not a past date. Only a date whose calendar
 * day is already over counts as past.
 */
export function isPastDate(input: string, timeZone: string = APP_TIMEZONE): boolean {
  const instant = parseUserDateTime(input, timeZone);
  if (!instant) return false; // unparseable is a separate error, handled by the parser
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}` < companyToday(timeZone);
}

/**
 * Parse a scheduling field, rejecting dates already in the past.
 *
 * Used by every create/edit path that sets a future-facing date — deadlines,
 * start dates, meeting times, follow-ups. Historical records are untouched:
 * this only runs on values a user just submitted, and routes skip the check
 * when the incoming value is unchanged from what is already stored.
 */
export function requireFutureDateTime(
  input: string,
  field = "date",
  timeZone: string = APP_TIMEZONE
): Date {
  const d = requireUserDateTime(input, field, timeZone);
  if (isPastDate(input, timeZone)) {
    throw new InvalidDateError(`${field}: cannot be in the past. Choose today or a later date.`);
  }
  return d;
}

/**
 * Parse an EDITED scheduling field: reject a past date, unless it is the value
 * already stored.
 *
 * This is what makes "existing historical records remain unchanged" true. Edit
 * forms round-trip every field, so a form that merely changes a lead's phone
 * number resubmits its close date too. Without this exemption, any record whose
 * date has since lapsed would become permanently uneditable — the guard would
 * fire on a field the user never touched.
 *
 * Only an actual MOVE is validated: pick a new date and it must be today or
 * later; leave it alone and it passes through untouched.
 */
export function keepOrRequireFuture(
  input: string,
  current: Date | null | undefined,
  field = "date",
  timeZone: string = APP_TIMEZONE
): Date {
  const parsed = requireUserDateTime(input, field, timeZone);
  if (current && parsed.getTime() === current.getTime()) return parsed;
  return requireFutureDateTime(input, field, timeZone);
}

/**
 * True when `instant` falls at midnight in APP_TIMEZONE — i.e. it was entered
 * as a date with no time. Replaces the old `getHours() === 0` checks, which
 * asked the *runtime's* zone and so gave different answers per environment.
 */
export function isDateOnly(instant: Date, timeZone: string = APP_TIMEZONE) {
  const { hour, minute } = zonedParts(instant, timeZone);
  return hour === 0 && minute === 0;
}

/** "yyyy-MM-dd" / "yyyy-MM-ddTHH:mm" for `instant` as seen in APP_TIMEZONE. */
export function toZonedInputValue(
  instant: Date,
  timeZone: string = APP_TIMEZONE,
  opts: { includeTime?: boolean } = {}
) {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const wantTime = opts.includeTime ?? !(p.hour === 0 && p.minute === 0);
  return wantTime ? `${date}T${pad(p.hour)}:${pad(p.minute)}` : date;
}
