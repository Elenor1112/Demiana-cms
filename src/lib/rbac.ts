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
  // Worker = who executes, as opposed to assignees, who stay accountable.
  "Task.AssignWorker": "Set the worker executing a task",
  "Task.ChangeWorker": "Replace or remove a task's worker once one is set",
  "Task.DelegateOwnTasks": "Delegate execution of tasks you are assigned to your own team",
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
  // Sales — leads & pipeline
  // Gates the Sales workspace itself: the sidebar section, every /sales route
  // and the sales quick-actions. Held by the sales roles only — see
  // canSeeSalesModule(). Granting this to anyone else makes the module visible
  // to them, which is exactly the intended (and only) way to widen it.
  "Sales.View": "Access the Sales workspace",
  "Sales.ViewAll": "View every lead in the pipeline (not just your own)",
  "Sales.LeadCreate": "Create leads",
  "Sales.LeadEdit": "Edit leads you can see",
  "Sales.LeadDelete": "Delete leads",
  "Sales.Assign": "Assign leads and change lead ownership",
  "Sales.ChangeStage": "Move leads between pipeline stages",
  "Sales.Convert": "Convert a won lead into a client and project",
  // Sales — activity objects
  "Sales.MeetingManage": "Schedule and manage sales meetings",
  "Sales.DiscoverySubmit": "Fill in and submit discovery briefs",
  "Sales.FeedbackSubmit": "Submit post-meeting sales feedback",
  "Sales.ProposalManage": "Create, send and track proposals",
  "Sales.IdeaManage": "Create and manage sales ideas",
  // Sales — oversight
  "Sales.ViewReports": "View sales reports and the sales dashboard",
  "Sales.ViewTeam": "View salesperson performance and the leaderboard",
  /// Granted to Account Management. Unlocks the sales history (brief, feedback,
  /// proposals) of leads that have ALREADY become clients, without exposing the
  /// live pipeline. Deliberately does NOT make the Sales module visible — it
  /// carries no navigation and no /sales route access, only the right to read
  /// closed-deal history for an account being managed.
  "Sales.ViewConverted": "Read the sales history of converted clients (no Sales workspace access)",
  // Job descriptions
  "JobDescription.ViewOwn": "View your own job description",
  "JobDescription.ViewAll": "View every employee's job description",
  "JobDescription.Upload": "Upload / replace job description documents",
  "JobDescription.Delete": "Delete a job description and its history",
  "JobDescription.ViewAcknowledgments": "View job description acknowledgment status",
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
    name: "PR & Sales Manager",
    level: 2,
    isSuperAdmin: false,
    description: "Owns the sales pipeline, assigns leads and converts won deals into clients.",
  },
  SALES_MEMBER: {
    name: "Sales Member",
    level: 4,
    isSuperAdmin: false,
    description: "Works their own assigned leads through the acquisition lifecycle.",
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
  // Every employee can read and acknowledge the job description assigned to
  // them — reach beyond their own document requires JobDescription.ViewAll.
  "JobDescription.ViewOwn",
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
    // Can set and change the worker on any task it can see, for the cases where
    // Account Management needs to redirect execution itself.
    "Task.AssignWorker",
    "Task.ChangeWorker",
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
    // Owns the employee lifecycle (Employee.Create/Edit/Delete above), so it
    // owns the document attached to it too.
    "JobDescription.ViewAll",
    "JobDescription.Upload",
    "JobDescription.Delete",
    "JobDescription.ViewAcknowledgments",
    // Operations and Account Management pick the relationship up AFTER the
    // handover: they can read the discovery brief, feedback and proposals of a
    // lead that has already become a client, but the live pipeline stays with
    // Sales. Deliberately not Sales.ViewAll.
    "Sales.ViewConverted",
    "Sales.IdeaManage",
  ],
  SALES_MANAGER: [
    ...baseEmployee,
    "Client.Create",
    "Client.Edit",
    "Task.Create",
    "Leave.Approve",
    "Permission.Approve",
    "Reports.View",
    // Full reach over the pipeline: sees every lead regardless of owner, moves
    // ownership around, and is the role that closes the loop by converting a
    // won lead into a client + project.
    "Sales.View",
    "Sales.ViewAll",
    "Sales.LeadCreate",
    "Sales.LeadEdit",
    "Sales.LeadDelete",
    "Sales.Assign",
    "Sales.ChangeStage",
    "Sales.Convert",
    "Sales.MeetingManage",
    "Sales.DiscoverySubmit",
    "Sales.FeedbackSubmit",
    "Sales.ProposalManage",
    "Sales.IdeaManage",
    "Sales.ViewReports",
    "Sales.ViewTeam",
    "Sales.ViewConverted",
    // Needed to nominate the account manager / project manager during
    // conversion, and to build the owner dropdown.
    "Project.Create",
  ],
  SALES_MEMBER: [
    ...baseEmployee,
    // Deliberately WITHOUT Sales.ViewAll: the visibility filter in lib/sales.ts
    // narrows every query to leads this person owns. Widening one individual is
    // a per-user ALLOW grant, not a role change.
    "Sales.View",
    "Sales.LeadCreate",
    "Sales.LeadEdit",
    "Sales.ChangeStage",
    "Sales.MeetingManage",
    "Sales.DiscoverySubmit",
    "Sales.FeedbackSubmit",
    "Sales.ProposalManage",
    "Sales.IdeaManage",
    // Their own numbers only — the reports API scopes by the same filter.
    "Sales.ViewReports",
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
    // The delegation case this whole flow exists for: an Art Director handed a
    // task picks which designer executes it, while staying the assignee.
    "Task.AssignWorker",
    "Task.ChangeWorker",
    "Task.DelegateOwnTasks",
    // Runs creative work end-to-end, so it can open a project to hang that work
    // off. Editing and deleting projects stay with Account Management.
    "Project.Create",
    "Leave.Approve",
    "Permission.Approve",
    // Sees acknowledgment state for the people who report to them (scoped by
    // jobDescriptionScope), but cannot upload or replace documents — that
    // stays with HR / Account Management.
    "JobDescription.ViewAcknowledgments",
  ],
  DESIGNER: [...baseEmployee, "Task.Edit"],
  CONTENT_CREATOR: [...baseEmployee, "Task.Edit"],
  COMMUNICATION_SPECIALIST: [...baseEmployee, "Task.Edit"],
  DEVELOPER: [...baseEmployee],
};

/**
 * Roles allowed to assign tasks to which roles (workflow constraint).
 *
 * Account Management briefs the Design Team directly — an Account Manager can
 * hand work to the Art Director or straight to a designer, rather than every
 * design task having to route through the Art Director first.
 */
export const ASSIGNMENT_MATRIX: Partial<Record<RoleKey, RoleKey[]>> = {
  CEO: Object.keys(ROLE_META) as RoleKey[],
  OPERATIONS_MANAGER: Object.keys(ROLE_META) as RoleKey[],
  ACCOUNT_MANAGER: ["ART_DIRECTOR", "DESIGNER", "CONTENT_CREATOR", "COMMUNICATION_SPECIALIST"],
  ART_DIRECTOR: ["DESIGNER"],
};

/**
 * Departments a role may assign into regardless of the assignee's role.
 *
 * The role matrix above cannot express "anyone on the Design Team", which is
 * what the business actually means — a new role added to that department (a
 * Motion Designer, say) should be briefable by Account Management on day one,
 * without a code change here. Matched by department *name*, so it survives the
 * id differing between environments.
 *
 * A user is assignable if they clear EITHER this or the role matrix.
 */
export const ASSIGNABLE_DEPARTMENTS: Partial<Record<RoleKey, string[]>> = {
  ACCOUNT_MANAGER: ["Design Team"],
  ART_DIRECTOR: ["Design Team"],
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
  avatarUrl: string | null;
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

/**
 * Whether `actorRole` may assign a task to someone with `targetRole`, optionally
 * in `targetDepartmentName`.
 *
 * Either dimension is sufficient: a role listed in the matrix is assignable
 * anywhere, and anyone in a listed department is assignable whatever their role.
 * Super admins bypass this entirely at the call sites.
 */
export function canAssignTo(
  actorRole: RoleKey,
  targetRole: RoleKey,
  targetDepartmentName?: string | null
) {
  if (ASSIGNMENT_MATRIX[actorRole]?.includes(targetRole)) return true;
  if (targetDepartmentName && ASSIGNABLE_DEPARTMENTS[actorRole]?.includes(targetDepartmentName)) {
    return true;
  }
  return false;
}

/**
 * How far a viewer can see into other people's job descriptions.
 *
 * Single source of truth for job-description visibility — every route that
 * returns another employee's document or acknowledgment state resolves scope
 * through here rather than re-deriving the rules.
 *
 *  - `all`        — super admins and holders of JobDescription.ViewAll.
 *  - `department` — managers who can see acknowledgment status: limited to
 *                   their own department, mirroring Task.ViewDepartment.
 *  - `self`       — everyone else. Their own document only.
 */
export type JobDescriptionScope =
  | { kind: "all" }
  | { kind: "department"; departmentId: string }
  | { kind: "self" };

export function jobDescriptionScope(user: SessionUser): JobDescriptionScope {
  if (can(user, "JobDescription.ViewAll")) return { kind: "all" };
  if (can(user, "JobDescription.ViewAcknowledgments") && user.departmentId) {
    return { kind: "department", departmentId: user.departmentId };
  }
  return { kind: "self" };
}

/**
 * How far a viewer can see into the sales pipeline.
 *
 * Single source of truth for lead visibility — every sales route and the global
 * search resolve scope through here rather than re-deriving the rules, which is
 * what keeps "sales members manage only assigned leads" true everywhere at once.
 *
 *  - `all`       — super admins and holders of Sales.ViewAll (PR & Sales Manager).
 *  - `own`       — sales members: leads they own or created.
 *  - `converted` — Operations / Account Management: only leads that have already
 *                  become clients, so the handover works without exposing the
 *                  live pipeline.
 *  - `none`      — no sales access at all.
 */
export type SalesScope =
  | { kind: "all" }
  | { kind: "own"; userId: string }
  | { kind: "converted" }
  | { kind: "none" };

export function salesScope(user: SessionUser): SalesScope {
  if (user.isSuperAdmin || can(user, "Sales.ViewAll")) return { kind: "all" };
  if (can(user, "Sales.View")) return { kind: "own", userId: user.id };
  if (can(user, "Sales.ViewConverted")) return { kind: "converted" };
  return { kind: "none" };
}

/**
 * Whether the Sales WORKSPACE is visible to this user — the sidebar section,
 * the /sales routes, and the sales quick-actions in the command palette.
 *
 * Deliberately narrower than `salesScope`, and the distinction matters:
 *
 *  - This answers "does the Sales module exist for you at all", and is true
 *    only for CEO, Operations Manager, PR & Sales Manager and Sales Members —
 *    i.e. holders of Sales.View (plus super admins).
 *  - `salesScope` answers "which lead ROWS may you read", and additionally
 *    admits the `converted` scope so Account Management can still open the
 *    discovery brief, feedback and proposals of a client they now own.
 *
 * Collapsing the two would force a choice between hiding the module and
 * keeping the post-handover history reachable; keeping them separate satisfies
 * both. Account Management therefore sees no Sales navigation and no pipeline,
 * while `/api/sales/clients` still answers for the accounts they manage.
 */
export function canSeeSalesModule(user: SessionUser) {
  return user.isSuperAdmin || can(user, "Sales.View");
}

/** Whether `viewer` may read `employeeId`'s job description. */
export function canViewJobDescriptionOf(
  viewer: SessionUser,
  employee: { id: string; departmentId: string | null }
) {
  if (viewer.id === employee.id) return can(viewer, "JobDescription.ViewOwn");
  const scope = jobDescriptionScope(viewer);
  if (scope.kind === "all") return true;
  if (scope.kind === "department") return employee.departmentId === scope.departmentId;
  return false;
}
