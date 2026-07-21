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
`Analytics` · `Audit` · `Settings` · `Policy`

## Role → Permission Matrix (summary)

| Permission | CEO | Ops | Acct Mgr | Sales Mgr | Art Dir | Designer | Content/Comms | Dev |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Task.View | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Task.Create | ✅ | ✅ | ✅ | ✅ | ✅ | — | — | — |
| Task.Assign | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Task.Approve | ✅ | ✅ | ✅ | — | ✅ | — | — | — |
| Task.Edit | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
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

*(Base employee permissions — View across Task/Project/Client/Employee/Department,
plus Leave/Permission/Resignation requests — are held by every role.)*

## Task-Assignment Matrix

Who may assign tasks **to** whom (a workflow constraint enforced in
`/api/tasks/meta` and `canAssignTo`):

| Actor | May assign to |
|---|---|
| CEO / Operations Manager | Anyone |
| Account Manager | Art Director, Content Creator, Communication Specialist |
| Art Director | Designers only |
| Others | (cannot assign) |

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
