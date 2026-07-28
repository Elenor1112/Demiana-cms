import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, toErrorResponse } from "@/lib/api";
import { zonedParts, requireUserDateTime, APP_TIMEZONE } from "@/lib/timezone";
import type { TaskStatus } from "@prisma/client";

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    // Month/day boundaries in the COMPANY zone. Built from server-local parts
    // these landed on the wrong instant on a UTC host, so "done this month" and
    // "overdue" were counted against a boundary up to 3h off the office day.
    const today = zonedParts(now);
    const monthStart = requireUserDateTime(
      `${today.year}-${String(today.month).padStart(2, "0")}-01`, "monthStart"
    );
    const todayStart = requireUserDateTime(
      `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`,
      "todayStart"
    );

    const [
      totalTasks, openTasks, doneThisMonth, overdue,
      totalEmployees, activeProjects, totalClients, pendingLeave,
      statusGroups, deptGroups, priorityGroups, clientGroups,
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
      // Workload per client. Groups on Task.clientId directly — the reason that
      // denormalized column exists.
      db.task.groupBy({ by: ["clientId"], _count: true }),
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

    // Tasks per client, busiest first. Tasks with no client (internal work with
    // no project) are grouped under "Internal" rather than dropped.
    const clientRows = await db.client.findMany({ select: { id: true, company: true } });
    const clientMap = new Map(clientRows.map((c) => [c.id, c.company]));
    const byClient = clientGroups
      .map((g) => ({
        name: g.clientId ? (clientMap.get(g.clientId) ?? "Unknown") : "Internal",
        count: g._count,
      }))
      .sort((a, b) => b.count - a.count);

    // 6-month completion trend
    const trend: { month: string; done: number; created: number }[] = [];
    // Month boundaries anchored in the company zone, like todayStart above.
    const monthKey = (offset: number) => {
      const m0 = today.month - 1 + offset;             // 0-based, may go negative
      const y = today.year + Math.floor(m0 / 12);
      const m = ((m0 % 12) + 12) % 12 + 1;             // wrap into 1..12
      return `${y}-${String(m).padStart(2, "0")}-01`;
    };
    for (let i = 5; i >= 0; i--) {
      const s = requireUserDateTime(monthKey(-i), "trendStart");
      const e = requireUserDateTime(monthKey(-i + 1), "trendEnd");
      const [done, created] = await Promise.all([
        db.task.count({ where: { status: "DONE", updatedAt: { gte: s, lt: e } } }),
        db.task.count({ where: { createdAt: { gte: s, lt: e } } }),
      ]);
      trend.push({
        month: new Intl.DateTimeFormat("en-US", { timeZone: APP_TIMEZONE, month: "short" }).format(s),
        done, created,
      });
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
    // Compared in the company zone: a birthday stored at midnight Cairo reads
    // as the previous day on a UTC host, which dropped people from the list at
    // month boundaries.
    const thisMonthBirthdays = birthdays.filter(
      (u) => u.birthDate && zonedParts(u.birthDate).month === today.month
    );

    return NextResponse.json({
      kpis: { totalTasks, openTasks, doneThisMonth, overdue, totalEmployees, activeProjects, totalClients, pendingLeave },
      byStatus, byDepartment, byPriority, byClient, trend, upcoming,
      birthdays: thisMonthBirthdays,
      me: { firstName: user.firstName },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
