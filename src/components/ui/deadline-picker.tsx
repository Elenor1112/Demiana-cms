"use client";
import * as React from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { Calendar, Clock, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { cn, formatDate, toDateTimeInputValue, todayInputMin } from "@/lib/utils";

/**
 * Deadline picker — a date control and a time control that write to one value.
 *
 * `value` / `onChange` speak the same "yyyy-MM-ddTHH:mm" string the previous
 * <input type="datetime-local"> produced, so the API contract, the Zod schema
 * and parseDeadline() on the server are all untouched. An empty string means
 * "no deadline", exactly as before.
 *
 * A date with no time is emitted as "yyyy-MM-dd" (no T), which the server
 * already treats as date-only — that keeps "due Friday" distinct from "due
 * Friday at 00:00".
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Split the stored string into its date and time halves. */
function splitValue(value: string) {
  if (!value) return { date: "", time: "" };
  const [date, time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function joinValue(date: string, time: string) {
  if (!date) return "";
  return time ? `${date}T${time}` : date;
}

/** "yyyy-MM-dd" from local parts — never toISOString(), which shifts the day. */
function toDateKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** "14:30" -> "2:30 PM" */
function formatTimeLabel(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return "";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function DeadlinePicker({
  value,
  onChange,
  disabled,
  id,
  /**
   * Earliest selectable day, "yyyy-MM-dd". Defaults to today in the company
   * zone: a deadline in the past is never a valid thing to schedule, and the
   * server rejects one anyway (requireFutureDateTime).
   *
   * Pass `allowPast` to opt out for a field that legitimately records history.
   */
  allowPast = false,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  allowPast?: boolean;
}) {
  const { date, time } = splitValue(value);
  const [dateOpen, setDateOpen] = React.useState(false);
  const [timeOpen, setTimeOpen] = React.useState(false);
  const dateRef = React.useRef<HTMLButtonElement>(null);
  const timeRef = React.useRef<HTMLButtonElement>(null);

  const selected = parseDateKey(date);

  /**
   * The time the picker is showing.
   *
   * Held here rather than derived purely from `value` because 12:00 AM stores
   * as local midnight, which reads back as date-only — without this the hour
   * column would snap from the 12 you just pressed back to the default. While
   * the panel is open this state is the source of truth; `value` catches up.
   */
  const [draftTime, setDraftTime] = React.useState(time);
  React.useEffect(() => {
    // Follow external changes (a different task, or the deadline being cleared)
    // but never while the panel is open, or it would fight the user.
    if (!timeOpen) setDraftTime(time);
  }, [time, timeOpen]);

  const setDate = (next: Date) => {
    onChange(joinValue(toDateKey(next), draftTime));
    setDateOpen(false);
  };
  const setTime = (next: string) => {
    setDraftTime(next);
    // Picking a time with no date yet would be meaningless — default to today.
    const base = date || toDateKey(new Date());
    onChange(joinValue(base, next));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ── Date ── */}
      <button
        id={id}
        ref={dateRef}
        type="button"
        disabled={disabled}
        onClick={() => { setDateOpen((o) => !o); setTimeOpen(false); }}
        aria-haspopup="dialog"
        aria-expanded={dateOpen}
        aria-label={selected ? `Deadline date: ${formatDate(selected)}. Change` : "Set deadline date"}
        className={cn(
          "inline-flex h-9 min-w-[9.5rem] flex-1 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors",
          "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          dateOpen && "border-primary ring-2 ring-ring"
        )}
      >
        <Calendar className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? formatDate(selected) : "Set date"}
        </span>
      </button>

      {/* ── Time ── */}
      <button
        ref={timeRef}
        type="button"
        disabled={disabled}
        onClick={() => { setTimeOpen((o) => !o); setDateOpen(false); }}
        aria-haspopup="dialog"
        aria-expanded={timeOpen}
        aria-label={draftTime ? `Deadline time: ${formatTimeLabel(draftTime)}. Change` : "Set deadline time"}
        className={cn(
          "inline-flex h-9 min-w-[7.5rem] items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors",
          "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          timeOpen && "border-primary ring-2 ring-ring"
        )}
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !draftTime && "text-muted-foreground")}>
          {draftTime ? formatTimeLabel(draftTime) : "Add time"}
        </span>
      </button>

      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear deadline"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="size-4" />
        </button>
      )}

      <Popover open={dateOpen} onClose={() => setDateOpen(false)} anchorRef={dateRef} className="w-[17rem]">
        <CalendarGrid
          selected={selected}
          onSelect={setDate}
          onClear={() => { onChange(""); setDateOpen(false); }}
          minKey={allowPast ? undefined : todayInputMin()}
        />
      </Popover>

      <Popover open={timeOpen} onClose={() => setTimeOpen(false)} anchorRef={timeRef} className="w-[15rem]">
        <TimeGrid value={draftTime} onSelect={setTime} onClear={() => { setDraftTime(""); onChange(joinValue(date, "")); setTimeOpen(false); }} />
      </Popover>
    </div>
  );
}

function CalendarGrid({
  selected,
  onSelect,
  onClear,
  /** Earliest selectable day as "yyyy-MM-dd"; undefined allows any day. */
  minKey,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
  onClear: () => void;
  minKey?: string;
}) {
  const [cursor, setCursor] = React.useState(() => selected ?? new Date());

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor));
    const end = endOfWeek(endOfMonth(cursor));
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          aria-label="Previous month"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold" aria-live="polite">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Next month"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const isSelected = selected ? isSameDay(day, selected) : false;
          const today = isToday(day);
          const outside = !isSameMonth(day, cursor);
          // Compared as "yyyy-MM-dd" strings, which sort lexicographically —
          // no Date arithmetic, so no off-by-one from a DST boundary.
          const past = minKey ? toDateKey(day) < minKey : false;
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={past}
              onClick={() => onSelect(day)}
              aria-label={day.toDateString()}
              aria-current={today ? "date" : undefined}
              aria-pressed={isSelected}
              aria-disabled={past || undefined}
              title={past ? "Past dates cannot be selected" : undefined}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outside && "text-muted-foreground/40",
                past && "cursor-not-allowed text-muted-foreground/30 line-through",
                !isSelected && !outside && !past && "hover:bg-accent",
                // Today is outlined; the selection is filled — so both stay
                // legible when today *is* the selected day.
                today && !isSelected && "font-semibold text-primary ring-1 ring-inset ring-primary/40",
                isSelected && "bg-primary font-semibold text-primary-foreground hover:bg-primary"
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onSelect(new Date())}
          className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/** Quick slots offered above the hour/minute columns. */
const PRESETS = ["09:00", "12:00", "14:00", "17:00"];

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

/** "14:30" -> { hour12: 2, minute: 30, period: "PM" } */
function decompose(time: string) {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute: m, period: h >= 12 ? "PM" : "AM" };
}

function compose(hour12: number, minute: number, period: string) {
  const h = period === "PM" ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Hour / minute / AM-PM columns.
 *
 * Deliberately not <input type="time">: its rendering and keyboard behaviour
 * differ per browser and it cannot be styled, which is what this refactor set
 * out to replace. Three scrollable columns behave identically everywhere and
 * are reachable by keyboard as ordinary buttons.
 */
function TimeGrid({
  value,
  onSelect,
  onClear,
}: {
  value: string;
  onSelect: (t: string) => void;
  onClear: () => void;
}) {
  // Default to 9:00 AM so opening the panel with no time set shows a sensible
  // starting point rather than an empty selection.
  const current = decompose(value) ?? { hour12: 9, minute: 0, period: "AM" };

  const commit = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    onSelect(compose(next.hour12, next.minute, next.period));
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {PRESETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "rounded-md border px-2 py-1 text-xs transition-colors",
              t === value
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
            )}
          >
            {formatTimeLabel(t)}
          </button>
        ))}
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Select time">
        <TimeColumn
          label="Hour"
          items={HOURS12.map((h) => ({ key: h, label: String(h) }))}
          selected={current.hour12}
          onPick={(h) => commit({ hour12: h })}
        />
        <TimeColumn
          label="Min"
          items={MINUTES.map((m) => ({ key: m, label: String(m).padStart(2, "0") }))}
          selected={current.minute}
          onPick={(m) => commit({ minute: m })}
        />
        <TimeColumn
          label=""
          items={[{ key: "AM", label: "AM" }, { key: "PM", label: "PM" }]}
          selected={current.period}
          onPick={(p) => commit({ period: p })}
        />
      </div>

      {value && (
        <div className="mt-2 border-t border-border pt-2">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Remove time
          </button>
        </div>
      )}
    </div>
  );
}

function TimeColumn<T extends string | number>({
  label,
  items,
  selected,
  onPick,
}: {
  label: string;
  items: { key: T; label: string }[];
  selected: T;
  onPick: (key: T) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  // Scroll the active row into view on open so the current value is visible
  // without hunting for it.
  React.useEffect(() => {
    const el = ref.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "center" });
    // Only on mount — re-running would yank the list while the user scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1">
      {label && (
        <div className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      )}
      <div
        ref={ref}
        className={cn("max-h-40 space-y-0.5 overflow-y-auto pr-0.5", !label && "mt-[18px]")}
      >
        {items.map((item) => {
          const active = item.key === selected;
          return (
            <button
              key={String(item.key)}
              type="button"
              data-active={active}
              aria-pressed={active}
              onClick={() => onPick(item.key)}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-center text-sm tabular-nums transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
/**
 * Convert a stored deadline into the picker's value.
 *
 * Local midnight is how the backend stores a date-only deadline, so it maps to
 * "yyyy-MM-dd" with no time — otherwise the picker would show a "12:00 AM" the
 * user never chose, and round-tripping would silently add one.
 */
export function toDeadlineInput(d?: Date | string | null) {
  const full = toDateTimeInputValue(d);
  if (!full) return "";
  // Local midnight opens as date-only: that is how the backend stores a
  // deadline with no time, and it is the far more common case. Selecting 12 AM
  // explicitly is handled in the picker itself, which keeps its own time state
  // so the hour column never snaps away from what was just pressed.
  return full.endsWith("T00:00") ? full.slice(0, 10) : full;
}
