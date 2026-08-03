# RBAC & Authorization

## Model

A user's **effective permissions** are computed as:

```
effective = rolePermissions(role)
          + userOverrides where effect = ALLOW
          − userOverrides where effect = DENY
```

Super-admin roles (**CEO**, **Operations Manager**) implicitly hold **every**
permission; overrides don't apply to them.

Permissions are checked:
- **Server:** `requirePermission("Task.Create")` in route handlers (throws 403).
- **Client:** `useCan()("Task.Create")` to gate UI affordances.

Source of truth: [`src/lib/rbac.ts`](../src/lib/rbac.ts).

## Roles (hierarchy)

| Level | Role | Super admin |
|---|---|---|
| 0 | CEO | ✅ |
| 1 | Operations Manager | ✅ |
| 2 | Account Manager | — |
| 2 | Sales Manager | — |
| 3 | Art Director | — |
| 4 | Designer / Content Creator / Communication Specialist / Developer | — |

## Permission Catalog (groups)

`Task` · `Project` · `Client` · `Employee` · `Department` · `Leave` ·
`Permission` · `Resignation` · `Performance` · `Warning` · `Eotm` · `Reports` ·
`Analytics` · `Audit` · `Settings` · `Policy` · `JobDescription`

## Role → Permission Matrix (summary)

| Permission | CEO | Ops | Acct Mgr | Sales Mgr | Art Dir | Designer | Content/Comms | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Task.View | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task.Create | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Task.Assign | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Task.Approve | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Task.Edit / Task.EditDetails | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(Edit) | ✅(Edit) | — |
| Task.ViewDepartment | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Task.ChangeStatus | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Project.Create/Edit | ✅ | ✅ | ✅ | — | — | — | — | — |
| Client.Create/Edit | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Employee.Create/Edit/Delete | ✅ | ✅ | — | — | — | — | — | — |
| Employee.EditPermissions | ✅ | ✅ | — | — | — | — | — | — |
| Department.* | ✅ | ✅ | — | — | — | — | — | — |
| Leave.Request | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Leave.Approve | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Leave.ApproveFinal | ✅ | ✅ | — | — | — | — | — | — |
| Permission.Approve | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Reports.View / Performance.View | ✅ | ✅ | ✅ | ✅(R) | — | — | — | — |
| Eotm.Manage | ✅ | ✅ | — | — | — | — | — | — |
| Audit.View | ✅ | ✅ | — | — | — | — | — | — |
| Settings.Edit / Policy.Manage | ✅ | ✅ | — | — | — | — | — | — |
| JobDescription.ViewOwn | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| JobDescription.ViewAll | ✅ | ✅ | ✅ | — | — | — | — | — |
| JobDescription.Upload / .Delete | ✅ | ✅ | ✅ | — | — | — | — | — |
| JobDescription.ViewAcknowledgments | ✅ | ✅ | ✅ | — | ✅(dept) | — | — | — |

*(Base employee permissions — View across Task/Project/Client/Employee/Department,
plus Leave/Permission/Resignation requests and JobDescription.ViewOwn — are held
by every role.)*

### Job Description visibility

Reach beyond your own document resolves through `jobDescriptionScope()` in
[`src/lib/rbac.ts`](../src/lib/rbac.ts) — one helper used by every route that can
expose another employee's document:

| Scope | Who | Sees |
|---|---|---|
| `all` | Super admins, `JobDescription.ViewAll` | Every employee |
| `department` | `JobDescription.ViewAcknowledgments` + a department | Their own department (+ themselves) |
| `self` | Everyone else | Their own document only |

Acknowledgment is always self-service: `POST .../ack` refuses a version that
belongs to anyone but the caller, regardless of permissions.

## Task-Assignment Matrix

Who may assign tasks **to** whom (a workflow constraint enforced in
`/api/tasks/meta` and `canAssignTo`):

| Actor | May assign to |
|---|---|
| CEO / Operations Manager | Anyone |
| Account Manager | Art Director, Designer, Content Creator, Communication Specialist, + anyone in Design Team |
| PR & Sales Manager | CEO, Operations Manager, Account Manager, Sales Member, Art Director, Designer, Content Creator, Communication Specialist, + anyone in Design Team |
| Art Director | Designers only, + anyone in Design Team |
| Others | (cannot assign) |

A user is assignable if they clear **either** the role matrix
(`ASSIGNMENT_MATRIX`) **or** the department carve-out (`ASSIGNABLE_DEPARTMENTS`),
so a new role added to the Design Team is briefable without a code change.

The PR & Sales Manager is the one actor below level 1 that assigns **upward**
(CEO, Operations Manager, Account Manager). A live deal produces work for those
roles — approve a quote, make an introduction, sign off on scope — and this
keeps it tracked in the system. The reach is task assignment only: it grants no
visibility, approval or edit rights over those roles anywhere else.

## Approval Routing

Leave / Permission / Resignation route through
[`src/lib/approvals.ts`](../src/lib/approvals.ts):

```
Employee → Direct Manager → Operations Manager → (CEO, resignations only)
```

- A rejection at any step short-circuits the request and notifies the requester
  with the reason and who rejected it.
- Each approval advances to and notifies the next approver.
- If no approvers resolve (e.g. the CEO submits), the request auto-approves.
