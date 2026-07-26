# API Reference

All endpoints are under `/api`. Auth is via HTTP-only cookies (set at login);
every non-public route requires a valid access token (enforced by middleware).
Bodies are validated with Zod. Errors return `{ "error": string }` with an
appropriate status (400 validation, 401 auth, 403 permission, 404 not found,
409 conflict, 422 business-rule).

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` | Sets access+refresh cookies |
| POST | `/api/auth/logout` | — | Revokes refresh, clears cookies |
| POST | `/api/auth/refresh` | — | Rotates refresh, mints access |
| GET | `/api/auth/me` | — | Current session user |

## Tasks
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/tasks` | Task.View | Filters: `q, status[], group(open\|closed), assignedTo, department, project, client, priority, createdBy, mine` |
| POST | `/api/tasks` | Task.Create | Auto code (`ELN-###`), assignees, labels |
| GET | `/api/tasks/:id` | Task.View | Full detail (subtasks, comments, activity, checklist, deps) |
| PATCH | `/api/tasks/:id` | authed | Status/progress workflow, assignees, labels |
| DELETE | `/api/tasks/:id` | Task.Delete | |
| POST | `/api/tasks/:id/comments` | authed | Notifies assignees/creator/mentions |
| POST/PATCH/DELETE | `/api/tasks/:id/checklist` | authed | Manage checklist items |
| GET | `/api/tasks/meta` | authed | Projects/clients/labels/depts + role-scoped assignables |

## Projects
| Method | Path | Permission |
|---|---|---|
| GET / POST | `/api/projects` | Project.View / Project.Create |
| GET / PATCH | `/api/projects/:id` | Project.View / Project.Edit |

## Employees & Org
| Method | Path | Permission |
|---|---|---|
| GET | `/api/employees` | authed (filters: `q, department, role, status`) |
| POST | `/api/employees` | Employee.Create |
| GET | `/api/employees/:id` | authed |
| PATCH | `/api/employees/:id` | Employee.Edit |
| DELETE | `/api/employees/:id` | Employee.Delete (soft — deactivate) |
| GET / PATCH | `/api/employees/:id/permissions` | Employee.EditPermissions (per-user ALLOW/DENY/INHERIT) |
| GET / POST | `/api/departments` | authed / Department.Create |

## Leave / Permissions / Resignation / Approvals
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/api/leave` | `scope=mine\|all`; POST runs handbook validations |
| PATCH | `/api/leave/:id` | `{ action: approve\|reject\|cancel, comment? }` |
| GET / POST | `/api/permissions-requests` | Permission requests |
| PATCH | `/api/permissions-requests/:id` | approve/reject/cancel |
| GET / POST | `/api/resignations` | Creates offboarding checklist |
| PATCH | `/api/resignations/:id` | approve/reject / toggle checklist item |
| GET | `/api/approvals` | Everything awaiting the caller's decision |

## EOTM / Analytics
| Method | Path | Permission |
|---|---|---|
| GET | `/api/eotm` | authed — recomputes scores, returns leaderboard/winner/hall-of-fame |
| POST | `/api/eotm/override` | Eotm.Manage — set winner + justification/reward |
| PATCH | `/api/eotm/override` | Eotm.Manage — update scoring weights |
| GET | `/api/analytics/overview` | authed — KPIs, trends, breakdowns |

## Job Descriptions
One document per employee, versioned. Uploads are `multipart/form-data`
(`file` = PDF, max 5 MB; optional `title`, `changeNote`); everything else is JSON.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/job-descriptions` | authed | `{ mine, roster }` — `roster` is null without JobDescription.ViewAcknowledgments. Filters: `q, department, employee, status(acknowledged\|pending\|missing)` |
| GET | `/api/employees/:id/job-description` | scoped | Document + full version history |
| POST | `/api/employees/:id/job-description` | JobDescription.Upload | Appends a version and re-points the document |
| DELETE | `/api/employees/:id/job-description` | JobDescription.Delete | Removes the document, all versions and acks |
| GET | `/api/job-descriptions/versions/:versionId/file` | scoped | Streams the PDF (`inline`; `?download=1` for attachment). ETag/304 |
| POST | `/api/job-descriptions/versions/:versionId/ack` | JobDescription.ViewOwn | Self only; 409 on a superseded version |

`POST /api/employees` also accepts `multipart/form-data` (`payload` = the JSON
body, `jobDescription` = PDF) to attach a document at creation time.

*Scoped* = own document always; others per `jobDescriptionScope()` — ViewAll sees
everyone, ViewAcknowledgments sees their own department, otherwise self only.

## Clients / Policies / Audit / Notifications
| Method | Path | Permission |
|---|---|---|
| GET / POST | `/api/clients` | authed / Client.Create |
| GET | `/api/policies` | authed (with per-user ack state) |
| POST | `/api/policies/:id/ack` | authed |
| GET | `/api/audit` | Audit.View |
| GET | `/api/notifications` | authed |
| POST | `/api/notifications/read-all` | authed |
