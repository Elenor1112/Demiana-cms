"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail, Phone, Calendar, Briefcase, Users, CheckSquare, Plane,
  ShieldCheck, Award, AlertTriangle, FileText, Cake, Pencil, UserX, Loader2, KeyRound,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ROLE_META } from "@/lib/rbac";
import { WARNING_META } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { apiGet, apiSend } from "@/lib/fetcher";
import { useCan, useSession } from "@/components/session-context";
import { PermissionEditor } from "./permission-editor";
import { JobDescriptionPanel } from "./job-description-panel";

type Employee = any;

const TABS = [
  "Overview", "Team", "Achievements", "Warnings",
  "Job Description", "Documents", "Access",
] as const;

export function EmployeeProfile({ employee }: { employee: Employee }) {
  const can = useCan();
  const me = useSession();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Overview");
  const [editOpen, setEditOpen] = React.useState(false);
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [resetPwOpen, setResetPwOpen] = React.useState(false);
  const roleMeta = ROLE_META[employee.role.key as keyof typeof ROLE_META];

  const isSelf = me.id === employee.id;
  // The job description tab is for people who manage the document plus the
  // employee themselves; everyone else has no business seeing it here.
  const canSeeJobDescription =
    isSelf ||
    can("JobDescription.ViewAll") ||
    (can("JobDescription.ViewAcknowledgments") &&
      me.departmentId != null &&
      employee.departmentId === me.departmentId);

  const visibleTabs = TABS.filter((t) => {
    if (t === "Access") return can("Employee.EditPermissions");
    if (t === "Job Description") return canSeeJobDescription;
    return true;
  });

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
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-1.5">
                <Badge color="#06B6D4">{roleMeta.name}</Badge>
                {employee.department && <Badge color={employee.department.color}>{employee.department.name}</Badge>}
                {roleMeta.isSuperAdmin && (
                  <Badge color="#8B5CF6"><ShieldCheck className="size-3" /> Super Admin</Badge>
                )}
              </div>
              {(can("Employee.Edit") || can("Employee.Delete") || can("Employee.EditPermissions")) && (
                <div className="flex gap-2">
                  {can("Employee.Edit") && (
                    <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                  )}
                  {can("Employee.EditPermissions") && !isSelf && employee.status !== "DEACTIVATED" && (
                    <Button size="sm" variant="outline" onClick={() => setResetPwOpen(true)}>
                      <KeyRound className="size-3.5" /> Reset password
                    </Button>
                  )}
                  {can("Employee.Delete") && !isSelf && employee.status !== "DEACTIVATED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => setDeactivateOpen(true)}
                    >
                      <UserX className="size-3.5" /> Deactivate
                    </Button>
                  )}
                </div>
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
        {tab === "Job Description" && canSeeJobDescription && (
          <JobDescriptionPanel
            employeeId={employee.id}
            employeeName={employee.firstName}
          />
        )}
        {tab === "Documents" && <DocumentsTab employee={employee} />}
        {tab === "Access" && can("Employee.EditPermissions") && (
          <PermissionEditor userId={employee.id} />
        )}
      </div>

      {can("Employee.Edit") && (
        <EditEmployeeDialog employee={employee} open={editOpen} onClose={() => setEditOpen(false)} />
      )}
      {can("Employee.Delete") && (
        <DeactivateDialog employee={employee} open={deactivateOpen} onClose={() => setDeactivateOpen(false)} />
      )}
      {can("Employee.EditPermissions") && (
        <ResetPasswordDialog employee={employee} open={resetPwOpen} onClose={() => setResetPwOpen(false)} />
      )}
    </div>
  );
}

function EditEmployeeDialog({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = React.useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    jobTitle: employee.jobTitle ?? "",
    phone: employee.phone ?? "",
    roleKey: employee.role.key,
    departmentId: employee.department?.id ?? employee.departmentId ?? "",
    managerId: employee.manager?.id ?? employee.managerId ?? "",
    status: employee.status,
    annualLeaveBalance: employee.annualLeaveBalance,
    sickLeaveBalance: employee.sickLeaveBalance,
  });

  const { data: deptData } = useQuery({
    queryKey: ["departments"],
    queryFn: () => apiGet<{ departments: { id: string; name: string }[] }>("/api/departments"),
    enabled: open,
  });
  const { data: empData } = useQuery({
    queryKey: ["employees"],
    queryFn: () => apiGet<{ employees: any[] }>("/api/employees"),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      apiSend(`/api/employees/${employee.id}`, "PATCH", {
        ...form,
        annualLeaveBalance: Number(form.annualLeaveBalance),
        sickLeaveBalance: Number(form.sickLeaveBalance),
        departmentId: form.departmentId || null,
        managerId: form.managerId || null,
      }),
    onSuccess: () => {
      toast.success("Employee updated");
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onClose={onClose} title="Edit employee" className="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>First name</Label><Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Job title</Label><Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Role</Label>
            <Select value={form.roleKey} onChange={(e) => set("roleKey", e.target.value)}>
              {Object.entries(ROLE_META).map(([key, meta]) => <option key={key} value={key}>{meta.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
              {["ACTIVE", "INVITED", "SUSPENDED", "OFFBOARDING", "DEACTIVATED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Department</Label>
            <Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}>
              <option value="">None</option>
              {deptData?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Manager</Label>
            <Select value={form.managerId} onChange={(e) => set("managerId", e.target.value)}>
              <option value="">None</option>
              {empData?.employees.filter((e) => e.id !== employee.id).map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Annual leave (days)</Label><Input type="number" value={form.annualLeaveBalance} onChange={(e) => set("annualLeaveBalance", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Sick leave (days)</Label><Input type="number" value={form.sickLeaveBalance} onChange={(e) => set("sickLeaveBalance", e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />} Save changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function DeactivateDialog({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const remove = useMutation({
    mutationFn: () => apiSend(`/api/employees/${employee.id}`, "DELETE"),
    onSuccess: () => {
      toast.success("Employee deactivated");
      qc.invalidateQueries({ queryKey: ["employees"] });
      onClose();
      router.refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onClose={onClose} title="Deactivate employee" description={`${employee.firstName} ${employee.lastName} will lose access immediately. Their tasks and history are preserved.`}>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="bg-destructive hover:bg-destructive/90" onClick={() => remove.mutate()} disabled={remove.isPending}>
          {remove.isPending && <Loader2 className="size-4 animate-spin" />} Deactivate
        </Button>
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const [password, setPassword] = React.useState("");
  const [mustChange, setMustChange] = React.useState(true);

  const valid =
    password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);

  const reset = useMutation({
    mutationFn: () =>
      apiSend(`/api/employees/${employee.id}/password`, "POST", {
        newPassword: password,
        mustChangePassword: mustChange,
      }),
    onSuccess: () => {
      toast.success("Password reset. Share it with the employee securely.");
      setPassword("");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reset password"
      description={`Set a new password for ${employee.firstName} ${employee.lastName}. All of their sessions will be signed out.`}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>New password</Label>
          <Input
            type="text"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 10 chars, upper + lower + number"
          />
          {password.length > 0 && !valid && (
            <p className="text-xs text-destructive">
              Must be 10+ characters with an uppercase letter, a lowercase letter and a number.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mustChange} onChange={(e) => setMustChange(e.target.checked)} />
          Require the employee to change it at next sign-in
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => reset.mutate()} disabled={!valid || reset.isPending}>
            {reset.isPending && <Loader2 className="size-4 animate-spin" />} Reset password
          </Button>
        </div>
      </div>
    </Dialog>
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
