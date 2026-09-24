# Ambulance Dispatch

A proof-of-concept dispatch system for a city ambulance service. A dispatcher logs incoming emergency requests with an urgency level; the system assigns the right ambulance by a fixed, explainable rule; the driver moves the job through its stages; and every decision leaves a record of who did what, when and why.

The POC is built to demonstrate four properties that matter more than feature count:

1. **Urgency beats proximity.** A critical call gets the nearest ambulance even if a routine call is closer to it.
2. **A vehicle can never be double-booked**, even when two dispatchers click Assign at the same instant.
3. **Drivers see and change only their own job.**
4. **Every change can be reconstructed later** from an append-only audit trail.

## Roles

| Role | Can do |
|---|---|
| **Super admin** | Manage users (create, edit, deactivate, reset password) and vehicles (create, edit, link a driver). View live positions. Everything a dispatcher can do through the API. Created automatically from `.env` on first start. |
| **Dispatcher** | Log requests, filter and page through them, assign a vehicle, override an assignment with a reason, cancel a request (API only; there is no cancel button yet), view the full history of any request, and watch live vehicle positions. |
| **Driver** | See the one job assigned to their vehicle, move it forward (en route, arrived) or back with a reason, and share their location. Cannot see or touch any other request. |

## Stack

- `server/` — Node, Express 5, TypeScript, Prisma 7 with the `pg` driver adapter, PostgreSQL, Zod, JWT. Tests use Vitest and Supertest.
- `client/` — React 19, Vite, TypeScript, MUI 9, Redux Toolkit / RTK Query, React Router 7.

## Running it locally

Prerequisites: Node 22+, PostgreSQL 14+.

**1. Create the database and a role** (the role needs `CREATEDB` so the integration tests can create their own `*_test` database):

```sql
CREATE ROLE ambulance WITH LOGIN PASSWORD 'ambulance' CREATEDB;
CREATE DATABASE ambulance_dispatch OWNER ambulance;
```

**2. Configure and start the server**

```bash
cd server
cp .env.example .env          # then fill in JWT_SECRET and the SUPER_ADMIN_* values
npm install
npx prisma migrate dev --config prisma7.config.ts   # applies all migrations
npx prisma generate --config prisma7.config.ts      # generates the Prisma client
npx prisma db seed --config prisma7.config.ts       # optional demo data (safe to re-run)
npm run dev                                         # http://localhost:4000
```

**3. Configure and start the client**

```bash
cd client
echo "VITE_API_BASE_URL=http://localhost:4000" > .env
npm install
npm run dev                                         # http://localhost:5173
```

**4. Run the tests** (from `server/`)

```bash
npm test                    # everything
npm run test:unit           # pure rule and state-machine tests, no database
npm run test:integration    # real Postgres + real HTTP; uses ambulance_dispatch_test, never your dev DB
```

## Logins

The super admin is whatever you put in `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`.

The seed (`npx prisma db seed --config prisma7.config.ts`) adds these, all with the password `Passw0rd!`:

| Email | Role | Vehicle |
|---|---|---|
| `dispatcher@ambulance-dispatch.dev` (Priya Shah) | Dispatcher | — |
| `driver.aman@ambulance-dispatch.dev` (Aman Patel) | Driver | AMB-01, available |
| `driver.rohit@ambulance-dispatch.dev` (Rohit Mehta) | Driver | AMB-02, **out of service** |
| `driver.sana@ambulance-dispatch.dev` (Sana Sheikh) | Driver | AMB-03, available |

It also seeds two waiting requests in Ahmedabad built for the urgency demo (see [Technical decisions](#urgency-before-proximity-as-a-pure-rule-module)): **Ramesh Iyer** (ROUTINE, ~2 km from AMB-01) and **Fatima Sheikh** (CRITICAL, ~8 km from AMB-01). AMB-02 is closer to Fatima but out of service.

## Environment variables

`server/.env` (validated with Zod at startup; the server refuses to start if any is missing or malformed):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string for the app. |
| `PORT` | Port the API listens on (default `4000`). |
| `NODE_ENV` | `development` (logs every SQL query), `test` or `production`. |
| `JWT_SECRET` | Secret used to sign access tokens. Use a long random string. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1h` or `7d`. |
| `CORS_ORIGIN` | The client's origin, e.g. `http://localhost:5173`. |
| `SUPER_ADMIN_EMAIL` | Email of the super admin created on first start. |
| `SUPER_ADMIN_PASSWORD` | That account's initial password (at least 8 characters). |
| `SUPER_ADMIN_NAME` | That account's display name. |
| `TEST_DATABASE_URL` | *Optional.* Database for integration tests. Defaults to `DATABASE_URL` with `_test` appended to the database name. |

`client/.env`:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the API, e.g. `http://localhost:4000`. |

## How the super admin bootstrap works

Before the server starts listening, `ensureSuperAdmin()` (`server/src/utils/seedAdmin.ts`) looks up `SUPER_ADMIN_EMAIL`. If no user has that email it creates one with role `SUPER_ADMIN`; if one exists it does nothing. So it is idempotent and create-only:

- Restarting never duplicates the account or resets its password.
- Changing `SUPER_ADMIN_PASSWORD` later has **no effect** on the existing account — change the password in the app instead.
- Changing `SUPER_ADMIN_EMAIL` creates a **second** super admin under the new email.
- If it fails (e.g. the database is down), the process exits instead of starting without an admin.

## API

All routes are under `/api` and require `Authorization: Bearer <token>` except `POST /api/auth/login` (and `GET /health`, outside `/api`). Authentication is applied to the whole router before any route is mounted, so a new route is protected by default. Errors always have the shape `{ "error": { "code", "message", "details" } }`.

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Email + password → JWT. |
| GET | `/auth/me` | any | The current user. |
| GET | `/users` | super admin | List users (filter by role/active, search, sort, paginate). |
| POST | `/users` | super admin | Create a user. |
| PATCH | `/users/:id` | super admin | Edit name/role/active. Cannot deactivate or demote yourself, or deactivate a driver on an active job. |
| PATCH | `/users/:id/password` | super admin | Set a new password. |
| GET | `/vehicles` | any | List vehicles (filter by status, paginate) with linked driver. |
| GET | `/vehicles/:id` | any | One vehicle. |
| POST | `/vehicles` | super admin | Create a vehicle, optionally linking a driver. |
| PATCH | `/vehicles/:id` | super admin | Edit code/status/driver. Non-driver → 400; driver already on another vehicle → 409. |
| GET | `/vehicles/positions` | dispatcher, super admin | Current position of every vehicle (current table only). |
| GET | `/vehicles/me/position` | driver | The caller's vehicle and its last saved position (shown on the driver screen after a refresh or login). |
| POST | `/vehicles/me/position` | driver | Report `{ latitude, longitude }` for the caller's own vehicle. |
| GET | `/requests` | dispatcher, super admin | List requests: multi-value `state`/`urgency` filters, sort by `createdAt`/`urgency`/`state`, `pageSize` ≤ 100. |
| POST | `/requests` | dispatcher, super admin | Log a request. `urgency` is required. |
| GET | `/requests/:id` | dispatcher, super admin; driver (own only) | One request with its current assignment. |
| POST | `/requests/:id/assign` | dispatcher, super admin | Pick and assign a vehicle by the rule; returns the ranked candidates. |
| POST | `/requests/:id/override` | dispatcher, super admin | Reassign to `vehicleId` with a required `reason`. |
| PATCH | `/requests/:id/state` | dispatcher, super admin; driver (own only) | `{ toState, version, reason? }` — a state-machine transition. |
| GET | `/requests/:id/history` | dispatcher, super admin; driver (own only) | The request's audit trail, oldest first, paginated. |
| GET | `/drivers/me/request` | driver | The job currently assigned to the caller's vehicle, or `null`. |

## Data model

| Table | What it holds |
|---|---|
| `users` | Everyone who can log in, with a single `role`. Passwords are bcrypt hashes and never leave the server. |
| `vehicles` | Ambulances: unique `code`, `status` (`AVAILABLE` / `OUT_OF_SERVICE`), and at most one linked driver (`driverId` is unique). |
| `vehicle_positions` | **Current** position — exactly one row per vehicle (primary key = `vehicleId`), overwritten on every ping. |
| `vehicle_position_history` | **Every** ping, append-only, indexed on `(vehicleId, recordedAt)` for route replay. |
| `requests` | Patient, address, coordinates, `urgency` (set at intake), `state`, and a `version` counter bumped on every change. |
| `assignments` | Which vehicle is on which request. `status` is `ACTIVE`, `COMPLETED`, `SUPERSEDED` (replaced by an override) or `CANCELLED`. An override row points back at the row it replaced (`overriddenFromId`) and stores `overrideReason`. |
| `audit_events` | Append-only log: actor, entity, action, from/to values, reason, timestamp. Indexed on `(entityType, entityId)`. |

Request lifecycle: `REQUESTED → ASSIGNED → EN_ROUTE → ARRIVED`, with `CANCELLED` possible from `REQUESTED` or `ASSIGNED`. `EN_ROUTE → ASSIGNED` and `ARRIVED → EN_ROUTE` are allowed only with a reason.

## Technical decisions

### Urgency before proximity as a pure rule module

`server/src/domain/assignmentRule.ts` holds the rule as plain functions over plain objects — no Prisma, no Express — so it is unit-tested without a database (`src/tests/unit/assignmentRule.test.ts`). The rule: **a request gets the nearest available vehicle that is not the nearest available vehicle of a waiting request with higher urgency.** Urgency ordering is data (`URGENCY_RANK`, `PRIORITY_KEYS`), so adding a tiebreaker such as request age is one more entry, not a change to the comparison.

Evaluating each request in isolation would not be enough: if the routine call were assigned first it would take the closest ambulance. With the rule, in the seeded scenario, assigning Ramesh (ROUTINE) first gives him **AMB-03 at 3.50 km** because AMB-01 (2.01 km) is held for Fatima (CRITICAL), who then gets **AMB-01 at 8.02 km**. The API returns the ranked candidates and the dispatcher's "Why this vehicle?" dialog shows exactly this. The service layer only loads data and persists the result; it contains no comparisons.

### The partial unique index for the one-vehicle guarantee

```sql
CREATE UNIQUE INDEX one_active_assignment_per_vehicle ON assignments ("vehicleId") WHERE status = 'ACTIVE';
```

Checking "is this vehicle free?" and then inserting is a race in any language: under Postgres's default READ COMMITTED isolation two transactions can both read the vehicle as free. The index makes the database the arbiter — the second insert blocks until the first commits and then fails with a unique violation (Prisma `P2002`), which the API turns into a 409 while its whole transaction rolls back. The concurrency test (`src/tests/integration/assignConcurrency.test.ts`) fires two real HTTP assign calls for the same vehicle 20 times against real Postgres and asserts exactly one 201, one 409 and one ACTIVE row; **with the index dropped, all 20 runs fail with two 201s**, which is how we know the test is genuinely concurrent.

Alternatives considered: `SELECT … FOR UPDATE` on the vehicle row (works, but every code path that assigns must remember to lock, and forgetting is silent); `SERIALIZABLE` isolation (correct, but pushes retry logic onto every caller); an application-level mutex (breaks with more than one server process). The index is declarative, cannot be bypassed by a new code path, and also guards overrides and job re-opening.

### Current versus history position tables

Position pings upsert `vehicle_positions` and append to `vehicle_position_history` in one transaction. The live view reads **only** the current table, which is bounded by the number of vehicles; deriving "latest per vehicle" from history would get slower every hour the system runs.

Write volume at 200 vehicles reporting every 5 seconds: 40 history rows per second = **144,000 rows per hour = 3,456,000 rows per day** (about 1.26 billion a year). At that scale history needs a retention policy and time-based partitioning (e.g. monthly partitions dropped after N months); neither is built.

### Version-based conflict detection

Every request row carries a `version`. State changes must send the version the client last saw; the update is `WHERE id = … AND version = …`, so a stale write matches zero rows and returns 409 ("This request was changed by dispatch") instead of silently overwriting. Assign and override bump the version too, so a driver screen still showing an overridden vehicle cannot act on it. The driver UI sends the version with every transition and offers a Refresh on conflict.

### Also worth knowing

- **Ownership is checked in the service layer**, inside the same transaction as the write. A role check only says "drivers may call this endpoint"; `assertDriverOwnsRequest` says "this driver may touch this request". Someone else's request and a non-existent one return the identical 403 body, so IDs cannot be probed; `src/tests/integration/authorization.test.ts` proves it and fails if the check is removed.
- **Audit rows are written with the transaction client** (`writeAudit(tx, …)` in `src/lib/audit.ts`), so a change and its audit row commit or roll back together.
- **Validation happens at the edge.** Zod schemas reject bad input (e.g. a missing urgency) before any business logic or database access; a test asserts no transaction is even opened.

## What was deliberately not built

| Not built | Why |
|---|---|
| Maps, routing and ETAs | Straight-line (Haversine) distance is enough to demonstrate the rule; road routing is an integration, not a design problem. |
| Real-time push (WebSockets/SSE) | Polling every 5–10 s is simple and adequate for a POC; the live table shows the interval. Push would be the first upgrade. |
| Automatic assignment | A dispatcher clicks Assign, keeping a human in the loop and making the demo explainable. |
| Refresh tokens, lockout, password reset by email | Auth is a single short-lived JWT. Production auth is well-understood work that does not change the design. |
| Position retention and partitioning | Numbers above; not needed at POC volume. |
| Auditing of users and vehicles | Only requests are audited. Driver-to-vehicle links, vehicle status and user changes are current-state only, so "who was driving AMB-01 on the 3rd" cannot be answered from history. |
| Database-enforced append-only audit | Nothing in the code updates or deletes audit rows, but the app's database role could. Production would revoke `UPDATE`/`DELETE` on `audit_events` or use a trigger. |
| Recording rejected attempts | 403s, 409s and validation failures are returned to the caller but not logged in the audit trail. |
| Snapshotting in audit rows | Actor name and role are joined live, and vehicles are recorded by code; renaming either changes how old history reads. The assignment's reason records the chosen vehicle, its distance and any nearer vehicle passed over, but not the full candidate list or the positions used. |
| Multiple regions, shifts, hospitals, patient records | Out of scope for the properties this POC exists to prove. |
