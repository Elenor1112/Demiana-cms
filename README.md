# Elenor OS — Internal Operations Platform

The operating system for **Elenor Marketing Agency**. A Notion/Linear/ClickUp-class
internal platform that centralizes tasks, projects, people, approvals, performance,
and company policy into one branded, RBAC-secured product.

Built as a **production-ready Next.js full-stack application** — real authentication,
real database, real permission model. No mocks, no placeholders.

---

## ✨ Features

| Area | What's included |
|---|---|
| **Tasks** | Kanban (drag-drop), List, Table, Calendar views · detail slide-over · subtasks · checklist · comments · activity log · labels · dependencies · multi-assignee · status workflow (Todo → In Progress → Hold → Waiting Approval → Done/Cancelled) |
| **Projects** | Client/industry/lead/members · computed progress · embedded task board |
| **People** | Employee directory (grid/list, filters) · rich profiles (6 tabs) · org hierarchy · departments |
| **RBAC** | Granular permission catalog · role→permission matrix · per-user ALLOW/DENY overrides · task-assignment matrix |
| **Leave** | Full request form · handbook validations (balance, overlap, active-task warning, acting employee + handover required) · multi-level approval · balance deduction |
| **Permissions** | Late arrival / early leave / etc. · same approval chain |
| **Resignation** | Form · offboarding checklist · CEO-optional chain · OFFBOARDING status |
| **Approvals** | Unified inbox for everything awaiting your decision |
| **Dashboard** | KPI grid · 6-month trend · workload · deadlines · birthdays · EOTM banner |
| **Employee of the Month** | Weighted scoring engine · auto ranking · leaderboard · manager override · Hall of Fame · achievements |
| **Analytics** | Company-wide charts (CVD-safe palette) |
| **Policies** | Company handbook · acknowledgment tracking · Blue/Yellow/Red card system |
| **Audit** | Who / did what / when / old→new value |
| **Notifications** | Real-time bell · task/approval/mention/leave/EOTM/birthday |
| **Platform** | ⌘K command palette · global search · light/dark · keyboard shortcuts · responsive · optimistic updates · smooth Framer Motion transitions |

---

## 🧱 Tech Stack

- **Framework:** Next.js 15 (App Router, RSC + Route Handlers)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS + custom cyan design system, `class-variance-authority`
- **Animation:** Framer Motion
- **Data:** PostgreSQL + Prisma ORM
- **Auth:** JWT access tokens + rotating refresh tokens (`jose`), bcrypt, HTTP-only cookies, edge middleware
- **State:** TanStack Query (server state) + Zustand (available for client state)
- **Forms:** React Hook Form + Zod
- **Tables:** TanStack Table · **Charts:** Recharts
- **Icons:** lucide-react · **Toasts:** sonner · **Command palette:** cmdk

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 18+
- A PostgreSQL database (local, or hosted on **Neon** / **Supabase**)

### 2. Install
```bash
npm install
```

### 3. Configure environment
Copy `.env.example` → `.env` and set your database URL + secrets:
```bash
cp .env.example .env
```
```env
DATABASE_URL="postgresql://user:pass@host:5432/elenor?sslmode=require"
JWT_ACCESS_SECRET="<openssl rand -base64 32>"
JWT_REFRESH_SECRET="<openssl rand -base64 32>"
```

### 4. Set up the database
```bash
npm run db:push     # create tables from the Prisma schema
npm run db:seed     # seed roles, permissions, org, demo data, policies
```

### 5. Run
```bash
npm run dev
```
Open http://localhost:3000

### 6. Log in
All demo accounts use the password **`Elenor@2026`**:

| Email | Role |
|---|---|
| ceo@elenor.com | CEO (super admin) |
| ops@elenor.com | Operations Manager (super admin) |
| account@elenor.com | Account Manager |
| art@elenor.com | Art Director |
| designer@elenor.com | Designer |
| content@elenor.com | Content Creator |
| comms@elenor.com | Communication Specialist |
| dev@elenor.com | Developer |

---

## 📜 Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (runs `prisma generate`) |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema to database |
| `npm run db:migrate` | Create a migration |
| `npm run db:seed` | Seed demo data |
| `npm run db:studio` | Open Prisma Studio |

---

## 📁 Documentation

See [`docs/`](./docs) for:
- [`ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design, folder structure, state, auth flow
- [`RBAC.md`](./docs/RBAC.md) — permission matrix & authorization model
- [`API.md`](./docs/API.md) — endpoint reference
- [`DATA-MODEL.md`](./docs/DATA-MODEL.md) — ERD & schema overview
- [`DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — deploy, security, testing, roadmap

---

## 🎨 Design System

Cyan-forward, minimal, professional. Brand tokens: primary `#06B6D4`, dark `#0F172A`,
success `#22C55E`, danger `#EF4444`, warning `#F59E0B`, info `#0EA5E9`. 14px radii,
light/dark theming via CSS variables, premium motion throughout.
