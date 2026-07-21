"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CheckSquare, Clock, AlertTriangle, Users, FolderKanban, Building2,
  Plane, Trophy, CalendarClock, Cake, TrendingUp,
} from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendArea, DeptBar, StatusDonut } from "@/components/charts/charts";
import { TASK_STATUS_META, PRIORITY_META } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";

export function DashboardClient() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-overview"],
    queryFn: () => apiGet<any>("/api/analytics/overview"),
  });
  const { data: eotm } = useQuery({
    queryKey: ["eotm-banner"],
    queryFn: () => apiGet<any>("/api/eotm"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const k = data.kpis;
  const kpis = [
    { label: "Open tasks", value: k.openTasks, icon: CheckSquare, color: "#06B6D4", href: "/tasks" },
    { label: "Done this month", value: k.doneThisMonth, icon: TrendingUp, color: "#22C55E", href: "/tasks" },
    { label: "Overdue", value: k.overdue, icon: AlertTriangle, color: "#EF4444", href: "/tasks" },
    { label: "Pending leave", value: k.pendingLeave, icon: Plane, color: "#F59E0B", href: "/approvals" },
    { label: "Employees", value: k.totalEmployees, icon: Users, color: "#8B5CF6", href: "/employees" },
    { label: "Active projects", value: k.activeProjects, icon: FolderKanban, color: "#0EA5E9", href: "/projects" },
    { label: "Clients", value: k.totalClients, icon: Building2, color: "#14B8A6", href: "/clients" },
    { label: "Total tasks", value: k.totalTasks, icon: CheckSquare, color: "#64748B", href: "/tasks" },
  ];

  const statusData = data.byStatus.map((s: any) => ({
    name: TASK_STATUS_META[s.status as TaskStatus].label,
    value: s.count,
    color: TASK_STATUS_META[s.status as TaskStatus].color,
  }));

  return (
    <div className="space-y-5">
      {/* EOTM celebration banner */}
      {eotm?.winner && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link href="/eotm">
            <div className="relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-r from-warning/10 via-primary/5 to-transparent p-5">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-warning/20 text-3xl">🏆</div>
                <div className="flex items-center gap-3">
                  <Avatar firstName={eotm.winner.user.firstName} lastName={eotm.winner.user.lastName} src={eotm.winner.user.avatarUrl} size={44} />
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-warning">Employee of the Month</div>
                    <div className="text-lg font-bold">{eotm.winner.user.firstName} {eotm.winner.user.lastName}</div>
                    <div className="text-xs text-muted-foreground">{eotm.winner.user.jobTitle ?? eotm.winner.user.role?.name} · Score {eotm.winner.total}</div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Link href={kpi.href}>
              <Card className="p-4 transition-all hover:border-primary/40 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-lg" style={{ backgroundColor: `${kpi.color}1A`, color: kpi.color }}>
                    <kpi.icon className="size-4" />
                  </div>
                </div>
                <div className="mt-3 text-2xl font-bold">{kpi.value}</div>
                <div className="text-xs text-muted-foreground">{kpi.label}</div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Task trend (6 months)</CardTitle></CardHeader>
          <CardContent><TrendArea data={data.trend} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>By status</CardTitle></CardHeader>
          <CardContent><StatusDonut data={statusData} /></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Workload by department</CardTitle></CardHeader>
          <CardContent>
            {data.byDepartment.length ? <DeptBar data={data.byDepartment} /> : <Empty text="No department data" />}
          </CardContent>
        </Card>

        {/* upcoming deadlines */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="size-4" /> Upcoming deadlines</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming.length ? data.upcoming.map((t: any) => (
              <Link key={t.id} href={`/tasks?task=${t.id}`} className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:border-primary/40">
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: PRIORITY_META[t.priority as keyof typeof PRIORITY_META].color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">{t.code} · {formatDate(t.deadline)}</div>
                </div>
                <AvatarGroup users={t.assignees.map((a: any) => a.user)} size={22} max={2} />
              </Link>
            )) : <Empty text="No upcoming deadlines" />}
          </CardContent>
        </Card>
      </div>

      {/* birthdays */}
      {data.birthdays.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cake className="size-4 text-primary" /> Birthdays this month</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.birthdays.map((b: any) => (
                <div key={b.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Avatar firstName={b.firstName} lastName={b.lastName} src={b.avatarUrl} size={30} />
                  <div>
                    <div className="text-sm font-medium">{b.firstName} {b.lastName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(b.birthDate)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{text}</div>;
}
