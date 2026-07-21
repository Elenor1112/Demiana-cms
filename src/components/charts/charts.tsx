"use client";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CATEGORICAL } from "@/lib/charts";

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const gridStroke = "hsl(var(--border))";

function TooltipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      {label && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ backgroundColor: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function TrendArea({ data }: { data: { month: string; done: number; created: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={axisStyle} axisLine={false} tickLine={false} />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        <Area name="Created" type="monotone" dataKey="created" stroke="#8B5CF6" strokeWidth={2} fill="url(#gCreated)" />
        <Area name="Completed" type="monotone" dataKey="done" stroke="#06B6D4" strokeWidth={2} fill="url(#gDone)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DeptBar({ data }: { data: { name: string; count: number; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={gridStroke} strokeDasharray="3 3" />
        <XAxis type="number" tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} width={110} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]} barSize={16}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusDonut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={2} stroke="hsl(var(--card))" strokeWidth={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={<TooltipBox />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{total}</span>
        <span className="text-xs text-muted-foreground">tasks</span>
      </div>
    </div>
  );
}
