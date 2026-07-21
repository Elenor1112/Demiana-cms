"use client";
import * as React from "react";
import { motion } from "framer-motion";
import {
  Mail, Phone, Calendar, Briefcase, Users, CheckSquare, Plane,
  ShieldCheck, Award, AlertTriangle, FileText, Cake,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ROLE_META } from "@/lib/rbac";
import { WARNING_META } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useCan } from "@/components/session-context";
import { PermissionEditor } from "./permission-editor";

type Employee = any;

const TABS = ["Overview", "Team", "Achievements", "Warnings", "Documents", "Access"] as const;

export function EmployeeProfile({ employee }: { employee: Employee }) {
  const can = useCan();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Overview");
  const roleMeta = ROLE_META[employee.role.key as keyof typeof ROLE_META];

  const visibleTabs = TABS.filter((t) => t !== "Access" || can("Employee.EditPermissions"));

  return (
    <div>
      {/* header card */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/20 via-info/15 to-transparent" />
        <div className="px-6 pb-5">
          <div className="-mt-10 flex flex-wrap items-end gap-4">
            <div className="rounded-full ring-4 ring-card">
              <Avatar firstName={employee.firstName} lastName={employee.lastName} src={employee.avatarUrl} size={80} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{employee.firstName} {employee.lastName}</h1>
                {employee.status !== "ACTIVE" && <Badge color="#F59E0B">{employee.status}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{employee.jobTitle ?? roleMeta.name}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge color="#06B6D4">{roleMeta.name}</Badge>
              {employee.department && <Badge color={employee.department.color}>{employee.department.name}</Badge>}
              {roleMeta.isSuperAdmin && (
                <Badge color="#8B5CF6"><ShieldCheck className="size-3" /> Super Admin</Badge>
              )}
            </div>
          </div>

          {/* quick stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={CheckSquare} label="Active tasks" value={employee._count.assignedTasks} />
            <Stat icon={Plane} label="Annual leave" value={`${employee.annualLeaveBalance}d`} />
            <Stat icon={Users} label="Direct reports" value={employee.reports.length} />
            <Stat icon={Award} label="Achievements" value={employee.achievements.length} />
          </div>
        </div>
      </Card>

      {/* tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {tab === t && (
              <motion.span layoutId="profile-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "Overview" && <OverviewTab employee={employee} />}
        {tab === "Team" && <TeamTab employee={employee} />}
        {tab === "Achievements" && <AchievementsTab employee={employee} />}
        {tab === "Warnings" && <WarningsTab employee={employee} />}
        {tab === "Documents" && <DocumentsTab employee={employee} />}
        {tab === "Access" && can("Employee.EditPermissions") && (
          <PermissionEditor userId={employee.id} />
        )}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.FC<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function OverviewTab({ employee }: { employee: Employee }) {
  const rows = [
    { icon: Mail, label: "Email", value: employee.email },
    { icon: Phone, label: "Phone", value: employee.phone ?? "—" },
    { icon: Briefcase, label: "Manager", value: employee.manager ? `${employee.manager.firstName} ${employee.manager.lastName}` : "—" },
    { icon: Calendar, label: "Hire date", value: formatDate(employee.hireDate) },
    { icon: Cake, label: "Birthday", value: formatDate(employee.birthDate) },
    { icon: Plane, label: "Sick leave balance", value: `${employee.sickLeaveBalance} days` },
  ];
  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <r.icon className="size-4" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{r.label}</div>
              <div className="text-sm font-medium">{r.value}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamTab({ employee }: { employee: Employee }) {
  if (!employee.reports.length)
    return <Empty icon={Users} text="No direct reports." />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {employee.reports.map((r: any) => (
        <a key={r.id} href={`/employees/${r.id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
          <Avatar firstName={r.firstName} lastName={r.lastName} src={r.avatarUrl} size={40} />
          <div>
            <div className="font-medium">{r.firstName} {r.lastName}</div>
            <div className="text-xs text-muted-foreground">{r.jobTitle ?? r.role.name}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

function AchievementsTab({ employee }: { employee: Employee }) {
  if (!employee.achievements.length) return <Empty icon={Award} text="No achievements yet." />;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {employee.achievements.map((a: any) => (
        <Card key={a.id} className="flex items-center gap-3 p-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-warning/15 text-2xl">🏆</div>
          <div>
            <div className="font-medium">{a.title}</div>
            <div className="text-xs text-muted-foreground">{formatDate(a.awardedAt)}</div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function WarningsTab({ employee }: { employee: Employee }) {
  if (!employee.warnings.length) return <Empty icon={ShieldCheck} text="Clean record — no warnings." />;
  return (
    <div className="space-y-2">
      {employee.warnings.map((w: any) => {
        const meta = WARNING_META[w.level as keyof typeof WARNING_META];
        return (
          <Card key={w.id} className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: meta.color }} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge color={meta.color}>{meta.label}</Badge>
                <span className="text-xs text-muted-foreground">{formatDate(w.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm">{w.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Issued by {w.issuedBy.firstName} {w.issuedBy.lastName}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DocumentsTab({ employee }: { employee: Employee }) {
  if (!employee.documents.length) return <Empty icon={FileText} text="No documents uploaded." />;
  return (
    <div className="space-y-2">
      {employee.documents.map((d: any) => (
        <Card key={d.id} className="flex items-center gap-3 p-3">
          <FileText className="size-4 text-muted-foreground" />
          <span className="flex-1 text-sm">{d.name}</span>
          <Badge>{d.category}</Badge>
        </Card>
      ))}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.FC<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
      <Icon className="size-9 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
