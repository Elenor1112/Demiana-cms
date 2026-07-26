import type { RoleKey } from "@prisma/client";

/**
 * Enterprise RBAC for Elenor OS.
 *
 * Permissions are granular, grouped by domain. A user's effective permission
 * set = (their role's permissions) + per-user ALLOW grants − per-user DENY grants.
 * Super-admin roles (CEO, Operations Manager) implicitly hold every permission.
 */

// ─── Permission catalog ───────────────────────────────────────

export const PERMISSIONS = {
  // Tasks
  "Task.View": "View tasks",
  "Task.ViewAll": "View every task in the agency (not just your own)",
  "Task.ViewDepartment": "View all tasks in your own department",
  "Task.Create": "Create tasks",
  "Task.Edit": "Edit tasks",
  "Task.EditDetails": "Edit task priority, deadline, title & description",
  "Task.Delete": "Delete tasks",
  "Task.Assign": "Assign tasks to others",
  "Task.Approve": "Approve tasks / content / designs",
  "Task.ChangeStatus": "Change task status",
  // Projects
  "Project.View": "View projects",
  "Project.Create": "Create projects",
  "Project.Edit": "Edit projects",
  "Project.Delete": "Delete projects",
  // Clients
  "Client.View": "View clients",
  "Client.Create": "Create clients",
  "Client.Edit": "Edit clients",
  "Client.Delete": "Delete clients",
  // Employees / users
  "Employee.View": "View employee profiles",
  "Employee.Create": "Create / invite users",
  "Employee.Edit": "Edit employees",
  "Employee.Delete": "Delete / deactivate users",
  "Employee.EditPermissions": "Edit user permissions",
  // Departments
  "Department.View": "View departments",
  "Department.Create": "Create departments",
  "Department.Edit": "Edit / archive departments",
  "Department.Delete": "Delete departments",
  // Leave & permission requests
  "Leave.Request": "Submit leave requests",
  "Leave.ViewAll": "View all leave requests",
  "Leave.Approve": "Approve leave (manager level)",
  "Leave.ApproveFinal": "Final approval (operations level)",
  "Permission.Request": "Submit permission requests",
  "Permission.Approve": "Approve permission requests",
  // Resignation
  "Resignation.Submit": "Submit resignation",
  "Resignation.Manage": "Manage resignation & offboarding",
  // Performance / discipline
  "Performance.View": "View performance dashboards",
  "Performance.Review": "Write performance reviews",
  "Warning.Issue": "Issue disciplinary warnings",
  "Eotm.Manage": "Manage Employee of the Month",
  // Reports / analytics
  "Reports.View": "View reports & analytics",
  "Analytics.Company": "View company-wide analytics",
  // Audit & settings
  "Audit.View": "View audit logs",
  "Settings.Edit": "Edit company settings",
  "Policy.Manage": "Manage company policies",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_GROUPS: Record<string, PermissionKey[]> = Object.keys(
  PERMISSIONS
).reduce((acc, key) => {
  const group = key.split(".")[0];
  (acc[group] ??= []).push(key as PermissionKey);
  return acc;
}, {} as Record<string, PermissionKey[]>);

// ─── Role definitions (hierarchy + super-admin) ──────────────

export const ROLE_META: Record<
  RoleKey,
  { name: string; level: number; isSuperAdmin: boolean; description: string }
> = {
  CEO: { name: "CEO", level: 0, isSuperAdmin: true, description: "Super admin — full access." },
  OPERATIONS_MANAGER: {
    name: "Operations Manager",
    level: 1,
    isSuperAdmin: true,
    description: "Super admin. Second-level approver for leave & permissions.",
  },
  ACCOUNT_MANAGER: {
    name: "Account Manager",
    level: 2,
    isSuperAdmin: false,
    description: "Owns client relationships, projects and task assignment.",
  },
  SALES_MANAGER: {
    name: "Sales Manager",
    level: 2,
    isSuperAdmin: false,
    description: "Manages sales pipeline and client acquisition.",
  },
  ART_DIRECTOR: {
    name: "Art Director",
    level: 3,
    isSuperAdmin: false,
    description: "Breaks down creative work and reviews designers.",
  },
  DESIGNER: {
    name: "Designer",
    level: 4,
    isSuperAdmin: false,
    description: "Executes design subtasks.",
  },
  CONTENT_CREATOR: {
    name: "Content Creator",
    level: 4,
    isSuperAdmin: false,
    description: "Produces content deliverables.",
  },
  COMMUNICATION_SPECIALIST: {
    name: "Communication Specialist",
    level: 4,
    isSuperAdmin: false,
    description: "Handles communication deliverables.",
  },
  DEVELOPER: {
    name: "Developer",
    level: 4,
    isSuperAdmin: false,
    description: "Development team (configurable).",
  },
};

// ─── Role → permission matrix ────────────────────────────────

const ALL = Object.keys(PERMISSIONS) as PermissionKey[];

const baseEmployee: PermissionKey[] = [
  "Task.View",
  "Task.ChangeStatus",
  "Project.View",
  "Client.View",
  "Employee.View",
  "Department.View",
  "Leave.Request",
  "Permission.Request",
  "Resignation.Submit",
];

export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  CEO: ALL,
  OPERATIONS_MANAGER: ALL,
  ACCOUNT_MANAGER: [
    ...baseEmployee,
    "Task.Create",
    "Task.Edit",
    "Task.EditDetails",
    "Task.ViewAll",
    "Task.Assign",
    "Task.Approve",
    "Project.Create",
    "Project.Edit",
    "Project.Delete",
    "Client.Create",
    "Client.Edit",
    "Client.Delete",
    // Can edit departments, but deleting one is an org-structure change that
    // stays with the CEO / Operations Manager.
    "Department.Edit",
    "Employee.Create",
    "Employee.Edit",
    "Employee.Delete",
    "Leave.Approve",
    "Permission.Approve",
    "Reports.View",
    "Performance.View",
  ],
  SALES_MANAGER: [
    ...baseEmployee,
    "Client.Create",
    "Client.Edit",
    "Task.Create",
    "Leave.Approve",
    "Permission.Approve",
    "Reports.View",
  ],
  ART_DIRECTOR: [
    ...baseEmployee,
    "Task.Create",
    "Task.Edit",
    "Task.EditDetails",
    // Sees their own department's work rather than the whole agency — an Art
    // Director needs reach over their designers' tasks to set priorities and
    // deadlines on them.
    "Task.ViewDepartment",
    "Task.Assign",
    "Task.Approve",
    "Leave.Approve",
    "Permission.Approve",
  ],
  DESIGNER: [...baseEmployee, "Task.Edit"],
  CONTENT_CREATOR: [...baseEmployee, "Task.Edit"],
  COMMUNICATION_SPECIALIST: [...baseEmployee, "Task.Edit"],
  DEVELOPER: [...baseEmployee],
};

/** Roles allowed to assign tasks to which roles (workflow constraint). */
export const ASSIGNMENT_MATRIX: Partial<Record<RoleKey, RoleKey[]>> = {
  CEO: Object.keys(ROLE_META) as RoleKey[],
  OPERATIONS_MANAGER: Object.keys(ROLE_META) as RoleKey[],
  ACCOUNT_MANAGER: ["ART_DIRECTOR", "CONTENT_CREATOR", "COMMUNICATION_SPECIALIST"],
  ART_DIRECTOR: ["DESIGNER"],
};

// ─── Runtime helpers ─────────────────────────────────────────

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleKey: RoleKey;
  isSuperAdmin: boolean;
  /** Needed to scope Task.ViewDepartment. */
  departmentId: string | null;
  permissions: string[]; // effective, resolved
};

export function can(user: Pick<SessionUser, "isSuperAdmin" | "permissions">, permission: PermissionKey) {
  if (user.isSuperAdmin) return true;
  return user.permissions.includes(permission);
}

export function canAny(user: Pick<SessionUser, "isSuperAdmin" | "permissions">, perms: PermissionKey[]) {
  if (user.isSuperAdmin) return true;
  return perms.some((p) => user.permissions.includes(p));
}

export function canAssignTo(actorRole: RoleKey, targetRole: RoleKey) {
  const allowed = ASSIGNMENT_MATRIX[actorRole];
  if (!allowed) return false;
  return allowed.includes(targetRole);
}
