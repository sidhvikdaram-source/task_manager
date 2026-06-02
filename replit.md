# Velocity

A gamified task manager where users complete tasks, earn VP (Victory Points), maintain streaks, and level up their productivity.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages (builds libs first)
- `pnpm run typecheck:libs` — build composite lib declarations (must run before leaf typechecks)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/task-manager`, preview `/`)
- API: Express 5 (`artifacts/api-server`, preview `/api`, port 8080)
- DB: PostgreSQL + Drizzle ORM
- Auth: Replit Auth (OpenID Connect) via `@workspace/replit-auth-web`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/db/src/schema/` — source of truth for DB schema (tasks, projects, habits, focus, user-stats, auth)
- `lib/api-spec/openapi.yaml` — source of truth for API contract
- `lib/api-client-react/` — generated React Query hooks (do not edit directly)
- `lib/api-zod/` — generated Zod schemas (do not edit directly)
- `lib/replit-auth-web/` — `useAuth()` hook for frontend auth state
- `artifacts/api-server/src/routes/` — per-resource Express routes
- `artifacts/task-manager/src/` — React frontend

## Architecture decisions

- **Contract-first API**: OpenAPI spec → codegen → Zod schemas + React Query hooks. Never hand-write what codegen produces.
- **Per-user data**: every table has `userId varchar` (nullable for backwards compat); routes filter by `req.user.id` from Replit Auth session.
- **Auth gate**: frontend wraps all content in `<AuthGate>` using `useAuth()`; unauthenticated users see a login screen.
- **Composite libs must be built before leaf typecheck**: run `pnpm run typecheck:libs` first, or use root `pnpm run typecheck` which does both.
- **`links` on tasks is `Array<{url: string; label?: string}>`** — label is optional both in DB type annotation and Zod schema.

## Product

- Dashboard with VP score, streak, level, completion stats, and daily checklist
- Task management: create/complete/edit tasks with due dates, start dates, estimated vs actual time, notes, and link attachments
- Projects/Classes: group tasks into projects with color labels
- Overdue triage modal: surfaces overdue tasks once per day for quick reschedule or deletion
- Bulk rescheduling: update due dates for multiple tasks at once
- Habits tracker and Focus timer (Pomodoro-style)
- Achievements panel based on completed count and streak days

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/task-manager run typecheck`** — otherwise the replit-auth-web declarations are missing and TS errors appear.
- **Do NOT use "Replit" or "Replit Auth" in user-facing UI** — use generic "Log in" / "Log out" labels.
- API port is **8080** (not 5000) — the workflow sets `PORT=8080`.
- `pnpm run dev` at workspace root does not exist by design; run individual artifact workflows instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `replit-auth` skill for auth route setup and session management details
