import type { PermissionKey } from "./rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name
  permission?: PermissionKey;
  section?: string;
};

export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard", section: "Workspace" },
  { label: "My Tasks", href: "/tasks", icon: "CheckSquare", section: "Workspace", permission: "Task.View" },
  { label: "Projects", href: "/projects", icon: "FolderKanban", section: "Workspace", permission: "Project.View" },
  { label: "Calendar", href: "/calendar", icon: "Calendar", section: "Workspace" },

  { label: "Clients", href: "/clients", icon: "Building2", section: "Business", permission: "Client.View" },
  { label: "Approvals", href: "/approvals", icon: "CheckCheck", section: "Business" },
  { label: "Leave", href: "/leave", icon: "Plane", section: "Business" },
  { label: "Permissions", href: "/permissions", icon: "Clock", section: "Business" },

  { label: "Employees", href: "/employees", icon: "Users", section: "People", permission: "Employee.View" },
  { label: "Departments", href: "/departments", icon: "Network", section: "People", permission: "Department.View" },
  { label: "Performance", href: "/performance", icon: "TrendingUp", section: "People", permission: "Performance.View" },
  { label: "Employee of the Month", href: "/eotm", icon: "Trophy", section: "People" },
  { label: "Policies", href: "/policies", icon: "BookOpen", section: "People" },

  { label: "Analytics", href: "/analytics", icon: "BarChart3", section: "Admin", permission: "Reports.View" },
  { label: "Audit Logs", href: "/audit", icon: "ScrollText", section: "Admin", permission: "Audit.View" },
  { label: "Settings", href: "/settings", icon: "Settings", section: "Admin" },
];

export const NAV_SECTIONS = ["Workspace", "Business", "People", "Admin"];
