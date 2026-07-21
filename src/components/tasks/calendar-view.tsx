"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PRIORITY_META, TASK_STATUS_META } from "@/lib/constants";
import type { TaskListItem } from "./task-bits";
import { Button } from "@/components/ui/button";

export function CalendarView({ tasks, onOpen }: { tasks: TaskListItem[]; onOpen: (id: string) => void }) {
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const byDay = React.useMemo(() => {
    const map: Record<number, TaskListItem[]> = {};
    for (const t of tasks) {
      if (!t.deadline) continue;
      const d = new Date(t.deadline);
      if (d.getFullYear() === year && d.getMonth() === month) {
        (map[d.getDate()] ??= []).push(t);
      }
    }
    return map;
  }, [tasks, year, month]);

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h3 className="text-sm font-semibold">
          {cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}
        </h3>
        <div className="flex gap-1">
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
            Today
          </Button>
          <Button size="icon" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-border text-center text-xs font-medium text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const isToday =
            day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const dayTasks = day ? byDay[day] ?? [] : [];
          return (
            <div
              key={i}
              className={`min-h-[96px] border-b border-r border-border p-1.5 ${
                i % 7 === 0 ? "border-l" : ""
              } ${!day ? "bg-secondary/20" : ""}`}
            >
              {day && (
                <>
                  <div className={`mb-1 text-xs ${isToday ? "flex size-5 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>
                    {day}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpen(t.id)}
                        className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium"
                        style={{ backgroundColor: TASK_STATUS_META[t.status].bg, color: PRIORITY_META[t.priority].color }}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <div className="px-1.5 text-[10px] text-muted-foreground">+{dayTasks.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
