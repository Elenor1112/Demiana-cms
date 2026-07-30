import type { PermissionKey } from "./rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name
  permission?: PermissionKey;
  section?: string;
  /**
   * Additionally require access to the Sales workspace (canSeeSalesModule).
   *
   * Item-level permissions alone are not enough for this section: Ideas is
   * gated on Sales.IdeaManage, which Account Management holds so it can raise
   * ideas against its own accounts — without this flag that single grant would
   * expose a "Sales" section in their sidebar. The module gate is a property of
   * the section, so it is declared per item rather than inferred from the
   * permission each one happens to use.
   */
  requiresSalesModule?: boolean;
};

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", section: "Workspace" },
  { label: "My Tasks", href: "/tasks", icon: "CheckSquare", section: "Workspace", permission: "Task.View" },
  { label: "Projects", href: "/projects", icon: "FolderKanban", section: "Workspace", permission: "Project.View" },
  { label: "Calendar", href: "/calendar", icon: "Calendar", section: "Workspace" },

  // Sales workspace — visible only to CEO, Operations Manager, PR & Sales
  // Manager and Sales Members. Every entry carries requiresSalesModule so the
  // whole section disappears for anyone else, whatever individual sales
  // permissions they may hold for other reasons.
  { label: "Dashboard", href: "/sales", icon: "Gauge", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Leads", href: "/sales/leads", icon: "UserSearch", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Pipeline", href: "/sales/pipeline", icon: "Columns3", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Discovery Briefs", href: "/sales/discovery", icon: "ClipboardList", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Meetings", href: "/sales/meetings", icon: "CalendarClock", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Sales Feedback", href: "/sales/feedback", icon: "MessageSquareText", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Proposals", href: "/sales/proposals", icon: "FileBadge", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Clients", href: "/sales/clients", icon: "Handshake", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Activities", href: "/sales/activities", icon: "Activity", section: "Sales", permission: "Sales.View", requiresSalesModule: true },
  { label: "Ideas", href: "/sales/ideas", icon: "Lightbulb", section: "Sales", permission: "Sales.IdeaManage", requiresSalesModule: true },
  { label: "Reports", href: "/sales/reports", icon: "ChartNoAxesCombined", section: "Sales", permission: "Sales.ViewReports", requiresSalesModule: true },
  { label: "Team", href: "/sales/team", icon: "UsersRound", section: "Sales", permission: "Sales.ViewTeam", requiresSalesModule: true },

  { label: "Clients", href: "/clients", icon: "Building2", section: "Business", permission: "Client.View" },
  { label: "Approvals", href: "/approvals", icon: "CheckCheck", section: "Business" },
  { label: "Leave", href: "/leave", icon: "Plane", section: "Business" },
  { label: "Permissions", href: "/permissions", icon: "Clock", section: "Business" },

  { label: "Employees", href: "/employees", icon: "Users", section: "People", permission: "Employee.View" },
  { label: "Departments", href: "/departments", icon: "Network", section: "People", permission: "Department.View" },
  { label: "Performance", href: "/performance", icon: "TrendingUp", section: "People", permission: "Performance.View" },
  { label: "Employee of the Month", href: "/eotm", icon: "Trophy", section: "People" },
  { label: "Policies", href: "/policies", icon: "BookOpen", section: "People" },
  { label: "Job Description", href: "/job-description", icon: "FileText", section: "People", permission: "JobDescription.ViewOwn" },

  { label: "Analytics", href: "/analytics", icon: "BarChart3", section: "Admin", permission: "Reports.View" },
  { label: "Audit Logs", href: "/audit", icon: "ScrollText", section: "Admin", permission: "Audit.View" },
  { label: "Settings", href: "/settings", icon: "Settings", section: "Admin" },
];

export const NAV_SECTIONS = ["Workspace", "Sales", "Business", "People", "Admin"];

/**
 * The nav entries a user may see.
 *
 * Shared by the sidebar and the command palette so the two can never disagree
 * about what is reachable — a page hidden from the sidebar but still offered by
 * ⌘K would be a real access leak, not just an inconsistency.
 *
 * Takes predicates rather than a SessionUser so it works unchanged in client
 * components (which hold `useCan()`) and on the server.
 */
export function visibleNav(opts: {
  can: (permission: PermissionKey) => boolean;
  canSeeSalesModule: boolean;
}): NavItem[] {
  return NAV.filter((item) => {
    if (item.requiresSalesModule && !opts.canSeeSalesModule) return false;
    return !item.permission || opts.can(item.permission);
  });
}
