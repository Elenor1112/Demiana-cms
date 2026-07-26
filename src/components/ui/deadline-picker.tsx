"use client";
import * as React from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth,
  isToday, startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { Calendar, Clock, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { cn, formatDate, toDateTimeInputValue } from "@/lib/utils";

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
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { date, time } = splitValue(value);
  const [dateOpen, setDateOpen] = React.useState(false);
  const [timeOpen, setTimeOpen] = React.useState(false);
  const dateRef = React.useRef<HTMLButtonElement>(null);
  const timeRef = React.useRef<HTMLButtonElement>(null);

  const selected = parseDateKey(date);

  const setDate = (next: Date) => {
    onChange(joinValue(toDateKey(next), time));
    setDateOpen(false);
  };
  const setTime = (next: string) => {
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
        disabled={disabled || !date}
        onClick={() => { setTimeOpen((o) => !o); setDateOpen(false); }}
        aria-haspopup="dialog"
        aria-expanded={timeOpen}
        aria-label={time ? `Deadline time: ${formatTimeLabel(time)}. Change` : "Set deadline time"}
        title={!date ? "Pick a date first" : undefined}
        className={cn(
          "inline-flex h-9 min-w-[7.5rem] items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors",
          "hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          timeOpen && "border-primary ring-2 ring-ring"
        )}
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !time && "text-muted-foreground")}>
          {time ? formatTimeLabel(time) : "Add time"}
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
        <CalendarGrid selected={selected} onSelect={setDate} onClear={() => { onChange(""); setDateOpen(false); }} />
      </Popover>

      <Popover open={timeOpen} onClose={() => setTimeOpen(false)} anchorRef={timeRef} className="w-[13rem]">
        <TimeGrid value={time} onSelect={setTime} onClear={() => { onChange(joinValue(date, "")); setTimeOpen(false); }} />
      </Popover>
    </div>
  );
}

function CalendarGrid({
  selected,
  onSelect,
  onClear,
}: {
  selected: Date | null;
  onSelect: (d: Date) => void;
  onClear: () => void;
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
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              aria-label={day.toDateString()}
              aria-current={today ? "date" : undefined}
              aria-pressed={isSelected}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outside && "text-muted-foreground/40",
                !isSelected && !outside && "hover:bg-accent",
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

/** Common slots first, with an exact field for anything else. */
const PRESETS = ["09:00", "10:00", "12:00", "14:00", "16:00", "17:00", "18:00", "23:59"];

function TimeGrid({
  value,
  onSelect,
  onClear,
}: {
  value: string;
  onSelect: (t: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const listRef = React.useRef<HTMLDivElement>(null);
  // Bring the chosen slot into view when the panel opens.
  React.useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="deadline-time-exact">
        Time
      </label>
      <input
        id="deadline-time-exact"
        type="time"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          // Only commit complete values — a half-typed time is not valid.
          if (/^\d{2}:\d{2}$/.test(e.target.value)) onSelect(e.target.value);
        }}
        className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div ref={listRef} className="mt-2 max-h-44 space-y-0.5 overflow-y-auto">
        {PRESETS.map((t) => {
          const active = t === value;
          return (
            <button
              key={t}
              type="button"
              data-selected={active}
              onClick={() => onSelect(t)}
              aria-pressed={active}
              className={cn(
                "block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary font-medium text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {formatTimeLabel(t)}
            </button>
          );
        })}
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
  return full.endsWith("T00:00") ? full.slice(0, 10) : full;
}
