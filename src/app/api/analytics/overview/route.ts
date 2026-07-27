import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import type { TaskStatus } from "@prisma/client";

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalTasks, openTasks, doneThisMonth, overdue,
      totalEmployees, activeProjects, totalClients, pendingLeave,
      statusGroups, deptGroups, priorityGroups,
    ] = await Promise.all([
      db.task.count(),
      db.task.count({ where: { status: { in: ["TODO", "IN_PROGRESS", "HOLD", "WAITING_APPROVAL"] } } }),
      db.task.count({ where: { status: "DONE", updatedAt: { gte: monthStart } } }),
      // A date-only deadline stores local midnight and means "end of that day",
      // so anything from today onwards is not yet overdue.
      db.task.count({ where: { deadline: { lt: todayStart }, status: { in: ["TODO", "IN_PROGRESS", "HOLD", "WAITING_APPROVAL"] } } }),
      db.user.count({ where: { status: "ACTIVE" } }),
      db.project.count({ where: { status: "ACTIVE" } }),
      db.client.count({ where: { status: "ACTIVE" } }),
      db.leaveRequest.count({ where: { status: "PENDING" } }),
      db.task.groupBy({ by: ["status"], _count: true }),
      db.task.groupBy({ by: ["departmentId"], _count: true }),
      db.task.groupBy({ by: ["priority"], _count: true }),
    ]);

    // resolve department names
    const depts = await db.department.findMany({ select: { id: true, name: true, color: true } });
    const deptMap = new Map(depts.map((d) => [d.id, d]));

    const byStatus = statusGroups.map((g) => ({ status: g.status as TaskStatus, count: g._count }));
    const byDepartment = deptGroups
      .filter((g) => g.departmentId)
      .map((g) => ({
        name: deptMap.get(g.departmentId!)?.name ?? "Unassigned",
        color: deptMap.get(g.departmentId!)?.color ?? "#64748B",
        count: g._count,
      }));
    const byPriority = priorityGroups.map((g) => ({ priority: g.priority, count: g._count }));

    // 6-month completion trend
    const trend: { month: string; done: number; created: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const [done, created] = await Promise.all([
        db.task.count({ where: { status: "DONE", updatedAt: { gte: s, lt: e } } }),
        db.task.count({ where: { createdAt: { gte: s, lt: e } } }),
      ]);
      trend.push({ month: s.toLocaleString("en-US", { month: "short" }), done, created });
    }

    // upcoming deadlines
    const upcoming = await db.task.findMany({
      where: { deadline: { gte: now }, status: { in: ["TODO", "IN_PROGRESS", "WAITING_APPROVAL"] } },
      orderBy: { deadline: "asc" },
      take: 6,
      select: {
        id: true, code: true, title: true, deadline: true, priority: true, status: true,
        // Rows lead with the client name and fall back to the code (taskRef).
        client: { select: { company: true } },
        assignees: { include: { user: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    // birthdays this month
    const birthdays = await db.user.findMany({
      where: { status: "ACTIVE", birthDate: { not: null } },
      select: { id: true, firstName: true, lastName: true, avatarUrl: true, birthDate: true },
    });
    const thisMonthBirthdays = birthdays.filter((u) => u.birthDate && u.birthDate.getMonth() === now.getMonth());

    return NextResponse.json({
      kpis: { totalTasks, openTasks, doneThisMonth, overdue, totalEmployees, activeProjects, totalClients, pendingLeave },
      byStatus, byDepartment, byPriority, trend, upcoming,
      birthdays: thisMonthBirthdays,
      me: { firstName: user.firstName },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
