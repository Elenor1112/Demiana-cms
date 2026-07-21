# Architecture

## Overview

Elenor OS is a **Next.js 15 full-stack application**. The App Router serves both the
UI (React Server + Client Components) and the backend (Route Handlers under
`src/app/api`). A single deployable unit talks to PostgreSQL via Prisma.

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                           │
│  React (RSC + Client) · TanStack Query · Framer Motion   │
└───────────────┬─────────────────────────┬───────────────┘
                │ fetch (cookies)          │ navigation
                ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│                    Next.js (App Router)                  │
│  Edge middleware ─ auth gate on every request            │
│  Route Handlers (/api/*) ─ Zod validation, RBAC guards   │
│  Server Components ─ session load, initial data          │
└───────────────┬─────────────────────────────────────────┘
                │ Prisma Client
                ▼
┌─────────────────────────────────────────────────────────┐
│                      PostgreSQL                          │
└─────────────────────────────────────────────────────────┘
```

## Folder Structure

```
src/
├── app/
│   ├── (app)/                 # authenticated app (route group)
│   │   ├── layout.tsx         # loads session, mounts AppShell
│   │   ├── dashboard/
│   │   ├── tasks/  calendar/  projects/[id]/
│   │   ├── employees/[id]/  departments/
│   │   ├── leave/  permissions/  approvals/
│   │   ├── eotm/  analytics/  performance/
│   │   ├── clients/  policies/  audit/  settings/
│   ├── api/                   # backend route handlers
│   │   ├── auth/              # login, logout, refresh, me
│   │   ├── tasks/  projects/  employees/  departments/
│   │   ├── leave/  permissions-requests/  resignations/  approvals/
│   │   ├── eotm/  analytics/  clients/  policies/  audit/  notifications/
│   ├── login/                 # public
│   ├── layout.tsx  globals.css  page.tsx
│   └── middleware.ts          # edge auth gate
├── components/
│   ├── ui/                    # primitives (button, card, dialog, …)
│   ├── shell/                 # sidebar, topbar, command palette, notifications
│   ├── tasks/                 # board, views, detail, dialogs
│   ├── charts/                # Recharts wrappers
│   ├── providers.tsx  theme-provider.tsx  session-context.tsx
└── lib/
    ├── db.ts                  # Prisma singleton
    ├── auth.ts / auth-edge.ts # tokens, cookies, session (node / edge)
    ├── rbac.ts                # permission catalog + role matrix
    ├── api.ts                 # requireUser/requirePermission, audit, error mapping
    ├── approvals.ts           # multi-step approval engine
    ├── tasks.ts  eotm.ts      # domain logic
    ├── notify.ts  constants.ts  charts.ts  utils.ts  nav.ts
prisma/
├── schema.prisma              # full ERD
└── seed.ts                    # roles, permissions, org, demo data, policies
```

## Authentication Flow

1. `POST /api/auth/login` — verify bcrypt hash → issue **access JWT** (15 min) + **opaque refresh token** (persisted, 7 days). Both set as HTTP-only cookies.
2. **Edge middleware** verifies the access JWT on every request (redirects pages to `/login`, returns 401 for APIs).
3. `POST /api/auth/refresh` — rotates the refresh token (old one revoked) and mints a fresh access JWT. Refresh tokens are single-use.
4. `POST /api/auth/logout` — revokes the refresh token and clears cookies.
5. Server components resolve the full session (with effective permissions) via `getSessionUser()`.

Access JWTs are verified at the edge with `jose` (no DB hit). Refresh + session
resolution happen in Node route handlers with Prisma.

## State Management

- **Server state:** TanStack Query — caching, optimistic updates (Kanban drag, checklist toggles), background refetch for notifications/approvals.
- **Session:** React context seeded server-side (`SessionProvider`), exposing `useSession()` / `useCan()`.
- **UI state:** local component state + `zustand` available for cross-component needs.
- **Theme:** context + `localStorage`, with an inline no-flash script in the root layout.

## Request Lifecycle (write example)

```
Client mutation (TanStack Query)
  → fetch POST /api/tasks  (HTTP-only cookie sent)
    → middleware: verify access JWT
    → handler: requirePermission("Task.Create")
    → Zod parse body
    → Prisma write
    → logActivity + audit + notify
    → JSON response
  → onSuccess: invalidate queries (optimistic already applied)
```

## Notifications

Written server-side via `lib/notify.ts` on domain events (assignment, approval
needed, decision, mention, comment, EOTM). The bell polls `/api/notifications`
every 20s and renders unread counts; "mark all read" clears them. The schema and
approach are WebSocket-ready — swap polling for a socket channel without changing
the write side.
