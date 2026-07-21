"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/fetcher";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { TrendArea, DeptBar, StatusDonut } from "@/components/charts/charts";
import { TASK_STATUS_META, PRIORITY_META } from "@/lib/constants";
import type { TaskStatus, TaskPriority } from "@prisma/client";

export function AnalyticsClient() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics-overview"], queryFn: () => apiGet<any>("/api/analytics/overview") });

  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;

  const statusData = data.byStatus.map((s: any) => ({
    name: TASK_STATUS_META[s.status as TaskStatus].label, value: s.count, color: TASK_STATUS_META[s.status as TaskStatus].color,
  }));
  const totalTasks = data.byPriority.reduce((s: number, p: any) => s + p.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Completion vs creation trend</CardTitle></CardHeader>
          <CardContent><TrendArea data={data.trend} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Task status distribution</CardTitle></CardHeader>
          <CardContent><StatusDonut data={statusData} /></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Department workload</CardTitle></CardHeader>
          <CardContent>{data.byDepartment.length ? <DeptBar data={data.byDepartment} /> : <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data</div>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Priority breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3 pt-2">
            {data.byPriority.map((p: any) => {
              const meta = PRIORITY_META[p.priority as TaskPriority];
              return (
                <div key={p.priority}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-muted-foreground">{p.count}</span>
                  </div>
                  <Progress value={totalTasks ? (p.count / totalTasks) * 100 : 0} color={meta.color} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total tasks", value: data.kpis.totalTasks },
          { label: "Open", value: data.kpis.openTasks },
          { label: "Overdue", value: data.kpis.overdue },
          { label: "Done this month", value: data.kpis.doneThisMonth },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
