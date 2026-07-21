# Data Model (ERD)

Full schema: [`prisma/schema.prisma`](../prisma/schema.prisma). PostgreSQL.

## Domains

### Identity, Org & RBAC
- **Role** — `key` (enum), `level`, `isSuperAdmin`; ↔ `RolePermission` ↔ **Permission**
- **Permission** — `key` (e.g. `Task.Create`), `group`
- **UserPermission** — per-user override (`ALLOW` / `DENY`)
- **User** — profile, `role`, `department`, self-referential `manager`/`reports`,
  leave balances; hub of most relations
- **Department** — `head` (User), `members`, `tasks`
- **RefreshToken** — rotating, revocable, per-device

### Clients & Projects
- **Client** → **Project** → **Task**
- **Project** — `client`, `lead`, `members` (ProjectMember), `status`, dates, budget
- **ProjectMember** — join (project × user)

### Tasks
- **Task** — `code`, status/priority enums, `progress`, deadline, hours,
  `approvalStatus`; self-referential `parent`/`subtasks`
- Joins: **TaskAssignee**, **TaskFollower**, **TaskLabel** (↔ **Label**),
  **TaskDependency**
- Children: **ChecklistItem**, **Attachment**, **Comment**, **Activity**

### Approvals
- **ApprovalStep** — generic engine keyed by `(kind, entityId, order)`; `roleKey`
  or `approver`, `decision`
- **LeaveRequest** — type, dates, days, acting user, handover, declaration, status,
  rejection metadata
- **PermissionRequest** — type, date/time window, status
- **Resignation** → **OffboardingItem[]** (asset/knowledge/handover/account/exit)

### Performance, EOTM, Discipline, Attendance
- **Attendance** — per user/day, check in/out, late, status
- **PerformanceReview** — quality score per period
- **Warning** — Blue/Yellow/Red card
- **EotmConfig** — six weights
- **EotmScore** — per user/period component + total
- **EotmWinner** — one per period, override + justification + reward
- **Achievement**, **EmployeeDocument**

### Platform
- **Notification** — typed, read flag, link
- **AuditLog** — actor, action, entity, old/new value, ip, device
- **Policy** → **PolicyAck** (per user/version)

## Key relationships

```
Role 1─* User *─1 Department
User 1─* User            (manager → reports)
User *─* Task            (TaskAssignee / TaskFollower)
Task 1─* Task            (parent → subtasks)
Task *─* Label           (TaskLabel)
Task *─* Task            (TaskDependency)
Client 1─* Project 1─* Task
ApprovalStep *─1 (Leave|Permission|Resignation)   via (kind, entityId)
User 1─* EotmScore ; EotmWinner *─1 User
```

## Enums
`RoleKey`, `UserStatus`, `GrantEffect`, `ClientStatus`, `ProjectStatus`,
`TaskStatus`, `TaskPriority`, `ApprovalStatus`, `ApprovalKind`, `StepDecision`,
`LeaveType`, `RequestStatus`, `PermissionRequestType`, `WarningLevel`,
`NotificationType`.
