"use client";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line,
} from "recharts";
import { categorical } from "@/lib/charts";
import { LEAD_STAGE_META } from "@/lib/sales-constants";
import { formatCompactMoney } from "@/lib/sales-constants";
import type { LeadStage } from "@prisma/client";

/**
 * Sales charts.
 *
 * Deliberately mirrors src/components/charts/charts.tsx: same axis styling,
 * same tooltip shell, same palette module. The two files stay separate because
 * their data shapes differ, not their design language.
 */

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const gridStroke = "hsl(var(--border))";

function TooltipBox({
  active,
  payload,
  label,
  money,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; fill?: string }[];
  label?: string;
  money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">
            {money ? formatCompactMoney(p.value ?? 0) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Pipeline funnel.
 *
 * Rendered as a horizontal bar chart rather than a tapering funnel shape: bar
 * length is a far more readable encoding of magnitude, and it keeps the stage
 * labels legible on a phone.
 */
export function PipelineFunnel({ data }: { data: { stage: LeadStage; count: number }[] }) {
  const rows = data.map((d) => ({
    name: LEAD_STAGE_META[d.stage].label,
    count: d.count,
    color: LEAD_STAGE_META[d.stage].color,
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={100} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]} barSize={18}>
          {rows.map((r, i) => <Cell key={i} fill={r.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SourceDonut({ data }: { data: { label: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="hsl(var(--card))"
            strokeWidth={2}
          >
            {data.map((_, i) => <Cell key={i} fill={categorical(i)} />)}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{total}</span>
        <span className="text-xs text-muted-foreground">leads</span>
      </div>
    </div>
  );
}

export function ConversionTrend({
  data,
}: {
  data: { month: string; won: number; lost: number; created: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCreatedLeads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Area name="New leads" type="monotone" dataKey="created" stroke="#06B6D4" strokeWidth={2} fill="url(#gCreatedLeads)" />
        <Area name="Won" type="monotone" dataKey="won" stroke="#22C55E" strokeWidth={2} fill="url(#gWon)" />
        <Area name="Lost" type="monotone" dataKey="lost" stroke="#EF4444" strokeWidth={2} fillOpacity={0} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Proposal acceptance: a single stacked bar reads as parts of one whole. */
export function AcceptanceBar({
  data,
}: {
  data: { status: string; count: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) {
    return (
      <div className="flex h-[120px] items-center justify-center text-sm text-muted-foreground">
        No proposals yet
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary">
        {data.map((d) => (
          <div
            key={d.status}
            style={{ width: `${(d.count / total) * 100}%`, backgroundColor: d.color }}
            title={`${d.status}: ${d.count}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {data.filter((d) => d.count > 0).map((d) => (
          <div key={d.status} className="flex items-center gap-1.5 text-xs">
            <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-muted-foreground">{d.status}</span>
            <span className="font-medium tabular-nums">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceBar({
  data,
}: {
  data: { name: string; won: number; pipelineValue: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={110} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="won" name="Deals won" radius={[0, 4, 4, 0]} barSize={16} fill="#22C55E" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueTrend({
  data,
}: {
  data: { month: string; revenue: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => formatCompactMoney(v).replace(/^\S+\s/, "")}
        />
        <Tooltip content={<TooltipBox money />} />
        <Line
          name="Revenue closed"
          type="monotone"
          dataKey="revenue"
          stroke="#06B6D4"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Weighted vs. gross pipeline value per stage. */
export function ForecastBar({
  data,
}: {
  data: { label: string; value: number; weighted: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => formatCompactMoney(v).replace(/^\S+\s/, "")}
        />
        <Tooltip content={<TooltipBox money />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Bar dataKey="value" name="Pipeline value" radius={[4, 4, 0, 0]} barSize={22} fill="#06B6D4" />
        <Bar dataKey="weighted" name="Weighted forecast" radius={[4, 4, 0, 0]} barSize={22} fill="#8B5CF6" />
      </BarChart>
    </ResponsiveContainer>
  );
}
