import type { TaskStatus, TaskPriority, RequestStatus, LeaveType } from "@prisma/client";

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; bg: string; group: "open" | "closed" }
> = {
  TODO: { label: "Todo", color: "#64748B", bg: "#F1F5F9", group: "open" },
  IN_PROGRESS: { label: "In Progress", color: "#0EA5E9", bg: "#E0F2FE", group: "open" },
  HOLD: { label: "Hold", color: "#F59E0B", bg: "#FEF3C7", group: "open" },
  WAITING_APPROVAL: { label: "Waiting Approval", color: "#8B5CF6", bg: "#EDE9FE", group: "open" },
  DONE: { label: "Done", color: "#22C55E", bg: "#DCFCE7", group: "closed" },
  CANCELLED: { label: "Cancelled", color: "#EF4444", bg: "#FEE2E2", group: "closed" },
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "HOLD",
  "WAITING_APPROVAL",
  "DONE",
  "CANCELLED",
];

export const PRIORITY_META: Record<
  TaskPriority,
  { label: string; color: string; weight: number }
> = {
  LOW: { label: "Low", color: "#64748B", weight: 1 },
  MEDIUM: { label: "Medium", color: "#0EA5E9", weight: 2 },
  HIGH: { label: "High", color: "#F59E0B", weight: 3 },
  URGENT: { label: "Urgent", color: "#EF4444", weight: 4 },
};

export const REQUEST_STATUS_META: Record<RequestStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#64748B" },
  PENDING: { label: "Pending", color: "#F59E0B" },
  APPROVED: { label: "Approved", color: "#22C55E" },
  REJECTED: { label: "Rejected", color: "#EF4444" },
  CANCELLED: { label: "Cancelled", color: "#64748B" },
};

export const LEAVE_TYPE_META: Record<LeaveType, { label: string }> = {
  ANNUAL: { label: "Annual" },
  SICK: { label: "Sick" },
  EMERGENCY: { label: "Emergency" },
  PERSONAL: { label: "Personal" },
  UNPAID: { label: "Unpaid" },
  OTHER: { label: "Other" },
};

export const WARNING_META = {
  BLUE: { label: "Blue Card", color: "#0EA5E9", note: "Verbal notice / minor issue" },
  YELLOW: { label: "Yellow Card", color: "#F59E0B", note: "Formal written warning" },
  RED: { label: "Red Card", color: "#EF4444", note: "Final warning / serious breach" },
};
