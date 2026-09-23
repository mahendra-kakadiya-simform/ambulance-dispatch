# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working rules

- **Never `git push` unless the user explicitly asks to push in that request.** Finishing a task, committing, or earlier approval does not count as permission to push.
- Implement only the functionality that was asked for. Don't add unrequested features, refactors or scope; suggest them instead.

## Overview

Ambulance dispatch system. Two independent npm projects, no root package.json:

- `server/` — Express 5 + TypeScript (ESM, NodeNext) + Prisma 7 on Postgres
- `client/` — Vite + React 19 + TypeScript + MUI + Redux Toolkit / RTK Query + React Router 7

Roles: `SUPER_ADMIN`, `DISPATCHER`, `DRIVER`.

## Commands

Server (run from `server/`):

```bash
npm run dev        # tsx watch src/server.ts (port from .env, default 4000)
npm run build      # tsc -> dist/  (also the typecheck)
npm start          # node dist/server.js
npx prisma migrate dev --config prisma7.config.ts     # apply/create migrations
npx prisma generate --config prisma7.config.ts        # regenerate client into src/generated/prisma
npx prisma db seed --config prisma7.config.ts         # runs prisma/seed.ts (idempotent)
```

Client (run from `client/`):

```bash
npm run dev        # vite (5173)
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

No test runner is configured yet (`server/src/tests/` is a placeholder).

Env: copy `server/.env.example` to `server/.env` (validated by Zod in `server/src/config/env.ts`; server refuses to start if invalid). Client needs `VITE_API_BASE_URL` in `client/.env`. The super admin is created on server boot from `SUPER_ADMIN_*` env vars (`utils/seedAdmin.ts`, create-only).

## Server architecture

Layers: `routes/` → `middleware/validate` → `controllers/` → `services/` → Prisma (`config/db.ts`). There is no `models/` folder: `prisma/schema.prisma` and the generated client (`src/generated/prisma`, gitignored) are the model layer.

- **Auth is fail-closed.** `app.ts` applies `authenticate` to the whole `/api` router before mounting any module, so new routes are protected automatically. The only public paths are an explicit `PUBLIC_PATHS` allowlist inside `middleware/auth.middleware.ts`. Role gating uses `requireRole(...)` from `middleware/role.middleware.ts`, applied at mount time in `app.ts`. `/health` lives outside `/api`.
- **Errors**: throw the typed `AppError` subclasses from `utils/errors.ts` (`ValidationError` 400, `UnauthenticatedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` / `InvalidTransitionError` 409). `middleware/error.middleware.ts` serialises them as `{ error: { code, message, details } }`.
- **Validation**: Zod schemas in `utils/validators.ts` with `{ body, query, params }` shape, applied via `validate(schema)`. It returns `ValidatedRequestHandler<S>`, the same type controllers use, so `req.body`/`req.query`/`req.params` are inferred.
- **List endpoints** follow the pattern in `GET /api/users`: DB-side filtering, search, offset pagination capped at 100, allowlisted sort fields, and a `{ data, meta }` response. Service params are typed via `z.infer<typeof schema.query>` rather than hand-written interfaces.
- DTO mappers (e.g. `toUserDto`) strip internal fields like `passwordHash`; never return raw Prisma rows.
- Prisma logs queries in development (`config/db.ts`). This is how DB-side filtering and paging are checked.

### Data model notes

Key models: `User`, `Vehicle`, `VehiclePosition` (current, PK = vehicleId), `VehiclePositionHistory` (append-only), `Request`, `Assignment` (self-relation `overriddenFromId` + `overrideReason` for overrides), `AuditEvent`. The migration `one_active_assignment_per_vehicle` is hand-written: it adds a partial unique index on `assignments("vehicleId") WHERE status='ACTIVE'`. That index is the concurrency guarantee against double-assigning a vehicle, so keep it in mind when writing assignment logic or new migrations.

## Client architecture

- `app/store.ts` + typed hooks in `app/hooks.ts`. All API calls go through RTK Query endpoints injected into `api/baseApi.ts`, which attaches the bearer token. A 401 on an already-authenticated request logs out; a failed login does not.
- `features/auth/authSlice.ts` persists token and user to localStorage. `ProtectedRoute` revalidates with `/api/auth/me` on load → `AppLayout` (role-filtered nav) → `RoleRoute` (per-section role gate). `/` redirects by role (`features/auth/roleLandingPath.ts`).
- Code is grouped by role under `features/admin`, `features/dispatcher` and `features/driver`.
- Map form errors from the server with `api/errorUtils.ts::extractApiError()` (field-level validation errors and CONFLICTs mapped onto fields). Reuse it for every form.
- Domain enums live in `types/index.ts` as `as const` objects plus DTO types. Extend that file instead of duplicating string literals.

## Toolchain gotchas

- **TypeScript 7 (tsgo) on the server** can pick the wrong overload when an inline object literal is passed to an overloaded function (e.g. `jwt.sign`) or when handlers in one `router.get(...)` chain have different generic types. Fix it by assigning the object to an explicitly typed `const` first, or by keeping every handler in a chain on the same generic instantiation.
- **Express 5**: `req.query` is getter-only; `validate.middleware.ts` replaces it with `Object.defineProperty`.
- **Prisma 7**: needs an explicit driver adapter (`@prisma/adapter-pg`); `PrismaClient` is constructed with `{ adapter }`. The config file is `prisma7.config.ts`, not the default name.
- **`exactOptionalPropertyTypes: true`** is on in both tsconfigs. Derive types from Zod schemas instead of writing optional interfaces by hand.
- **MUI 9 `Stack`**: put `alignItems`/`justifyContent` in `sx`, not as props, or TS reports a misleading overload error.
- Server imports use the `.js` extension (NodeNext ESM) and `import type` where applicable (`verbatimModuleSyntax`).
