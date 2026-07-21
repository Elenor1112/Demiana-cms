# Deployment, Security, Testing & Roadmap

## Deployment (Vercel + Neon)

Elenor OS is a single Next.js app — deploy the whole thing to **Vercel** with a
**Neon** (or Supabase) PostgreSQL database.

### Steps
1. Push this repo to GitHub.
2. Import it in Vercel → it auto-detects Next.js.
3. Set environment variables (Project → Settings → Environment Variables):
   ```
   DATABASE_URL         (Neon pooled connection string)
   JWT_ACCESS_SECRET    (openssl rand -base64 32)
   JWT_REFRESH_SECRET   (openssl rand -base64 32)
   ACCESS_TOKEN_TTL=15m
   REFRESH_TOKEN_TTL_DAYS=7
   NEXT_PUBLIC_APP_URL=https://your-domain
   ```
4. Deploy. The `build` script runs `prisma generate` automatically.
5. From your machine (or a one-off job), apply the schema and seed:
   ```bash
   npm run db:push
   npm run db:seed        # optional — demo data
   ```

### Serverless database notes
- Use Neon's **pooled** connection string. This app appends
  `connection_limit`, `pool_timeout`, and `connect_timeout` for stability under
  serverless bursts.
- Neon compute **suspends when idle**; the first query after idle can briefly
  fail. `src/lib/db.ts` wraps every query in a **retry-with-backoff** extension so
  cold starts don't surface as errors.
- Heavy aggregations (EOTM scoring) use **bounded concurrency** to respect the
  pool. For scale, move EOTM recompute to a cron/queue and cache results.

## Security

- **Auth:** bcrypt (cost 12) password hashing · short-lived access JWT (15m) ·
  opaque, rotating, revocable refresh tokens (single-use) · HTTP-only, SameSite,
  Secure cookies · edge middleware gate on every request.
- **AuthZ:** granular RBAC checked server-side on every mutating route
  (`requirePermission`), not just in the UI. Verified: non-privileged roles get
  **403** on admin actions.
- **Input validation:** every route body parsed with **Zod**.
- **SQL injection:** Prisma parameterizes all queries.
- **Audit trail:** sensitive actions recorded (actor, action, entity, old→new
  value) in `AuditLog`.
- **Soft deletes:** users are deactivated, not hard-deleted — preserving history
  and revoking their refresh tokens.
- **Secrets:** never committed; `.env` is git-ignored.

### Production hardening checklist
- [ ] Rotate `JWT_*` secrets away from the dev defaults.
- [ ] Add rate limiting on `/api/auth/login` (e.g. Upstash).
- [ ] Enable HTTPS-only + HSTS (automatic on Vercel).
- [ ] Add CSP headers.
- [ ] Set up DB backups / PITR (Neon provides this).
- [ ] Wire object storage (R2/S3) for real file attachments.

## Testing Strategy

The codebase is structured for testability (pure domain logic in `lib/`,
thin route handlers). Recommended layers:

| Layer | Tool | Targets |
|---|---|---|
| Unit | Vitest | `lib/rbac` (matrix), `lib/eotm` (scoring), `lib/approvals` (chain), `lib/utils` |
| Integration | Vitest + test DB | route handlers (auth, RBAC 403s, workflow transitions) |
| E2E | Playwright | login → create task → move on Kanban → approve leave |
| Types | `tsc --noEmit` | already green |
| Build | `next build` | already green (all routes) |

This build was verified live against Neon: all 16 API read endpoints → 200,
writes → 201, and RBAC denials → 403.

## Future Roadmap

**Near term**
- Real-time via WebSockets (schema already notification-ready) — replace polling.
- File uploads to Cloudflare R2 / S3 (attachments, avatars, documents).
- Attendance capture (check-in/out) feeding EOTM automatically.
- Timeline / Gantt view for projects.
- Email/push notification delivery.

**Mid term**
- Revenue & budget KPIs on the CEO dashboard.
- Client portal (external, scoped access).
- Advanced reporting export (PDF/CSV).
- Saved filters & custom views per user.
- Multi-office / multi-workspace support.

**Long term**
- Mobile app (React Native) sharing the API.
- AI assist: task summarization, workload balancing, smart deadlines.
- SSO / SCIM for enterprise identity.
