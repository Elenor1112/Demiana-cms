"use client";
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Search, Plus, Users, Mail, Phone, LayoutGrid, List } from "lucide-react";
import { apiGet } from "@/lib/fetcher";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_META } from "@/lib/rbac";
import { useCan } from "@/components/session-context";
import { CreateEmployeeDialog } from "./create-employee-dialog";
import type { RoleKey } from "@prisma/client";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  status: string;
  role: { key: RoleKey; name: string };
  department?: { name: string; color: string } | null;
  manager?: { firstName: string; lastName: string } | null;
  _count: { assignedTasks: number };
};

type Dept = { id: string; name: string };

export function EmployeesClient() {
  const can = useCan();
  const [q, setQ] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [role, setRole] = React.useState("");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [createOpen, setCreateOpen] = React.useState(false);

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<{ departments: Dept[] }>("/api/departments"),
  });

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (dept) params.set("department", dept);
  if (role) params.set("role", role);

  const { data, isLoading } = useQuery({
    queryKey: ["employees", q, dept, role],
    queryFn: () => apiGet<{ employees: Employee[] }>(`/api/employees?${params}`),
  });

  const employees = data?.employees ?? [];

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employees…"
            className="pl-9"
          />
        </div>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-44">
          <option value="">All departments</option>
          {deptData?.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-44">
          <option value="">All roles</option>
          {Object.entries(ROLE_META).map(([key, meta]) => (
            <option key={key} value={key}>{meta.name}</option>
          ))}
        </Select>
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <button
            onClick={() => setView("grid")}
            className={`rounded-md p-1.5 ${view === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded-md p-1.5 ${view === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"}`}
          >
            <List className="size-4" />
          </button>
        </div>
        {can("Employee.Create") && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Add employee
          </Button>
        )}
      </div>

      {/* results */}
      <div className="mt-5">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
            <Users className="size-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No employees match your filters.</p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {employees.map((emp, i) => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <Link
                  href={`/employees/${emp.id}`}
                  className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <Avatar firstName={emp.firstName} lastName={emp.lastName} src={emp.avatarUrl} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">
                          {emp.firstName} {emp.lastName}
                        </span>
                        {emp.status !== "ACTIVE" && (
                          <Badge color="#F59E0B" className="text-[10px]">{emp.status}</Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {emp.jobTitle ?? emp.role.name}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge color="#06B6D4">{emp.role.name}</Badge>
                    {emp.department && <Badge color={emp.department.color}>{emp.department.name}</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="size-3" /> {emp.email.split("@")[0]}</span>
                    <span>{emp._count.assignedTasks} tasks</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Department</th>
                  <th className="px-4 py-2.5 font-medium">Manager</th>
                  <th className="px-4 py-2.5 font-medium">Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <Link href={`/employees/${emp.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary">
                        <Avatar firstName={emp.firstName} lastName={emp.lastName} src={emp.avatarUrl} size={30} />
                        <div>
                          <div>{emp.firstName} {emp.lastName}</div>
                          <div className="text-xs font-normal text-muted-foreground">{emp.jobTitle}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5"><Badge color="#06B6D4">{emp.role.name}</Badge></td>
                    <td className="px-4 py-2.5 text-muted-foreground">{emp.department?.name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{emp._count.assignedTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateEmployeeDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        departments={deptData?.departments ?? []}
        employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }))}
      />
    </div>
  );
}
