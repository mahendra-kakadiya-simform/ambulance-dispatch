/**
 * The sharpest test in the POC: two assignment attempts racing for the same vehicle.
 *
 * Runs against a real Postgres database (ambulance_dispatch_test — see testDatabase.ts),
 * through the real Express app, over real HTTP. Nothing is mocked. Each run sets up two
 * ROUTINE requests and exactly one available vehicle, so both attempts' rule evaluation
 * resolves to that same vehicle, then fires both at once with Promise.allSettled.
 *
 * Resetting the database between runs:
 *   - Each run starts by deleting all rows from the test database (resetData below), so
 *     runs never see each other's data. It refuses to run against a non-*_test database.
 *   - vitest's globalSetup applies any pending migrations before every suite run. It
 *     does not undo manual schema changes (a dropped index stays dropped).
 *   - To rebuild the test database from scratch:
 *       DATABASE_URL=<test url> npx prisma migrate reset --force --config prisma7.config.ts
 *
 * Proving the test is real: drop the index in the TEST database and run it again. It must
 * fail (both attempts succeed and two ACTIVE rows appear):
 *   psql <test url> -c 'DROP INDEX one_active_assignment_per_vehicle'
 *   npm run test:integration   # expect all 20 runs to fail with [201, 201]
 * Then restore it (the failed runs leave duplicate ACTIVE rows, so clear them first):
 *   psql <test url> -c 'DELETE FROM assignments' \
 *     -c "CREATE UNIQUE INDEX one_active_assignment_per_vehicle ON assignments (\"vehicleId\") WHERE status = 'ACTIVE'"
 */
import bcrypt from 'bcryptjs';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../config/db.js';
import { assertTestDatabase } from '../testDatabase.js';

const RUNS = 20;
const PASSWORD = 'Passw0rd!';

let server: Server;
let token: string;
let dispatcherId: string;

async function resetData(): Promise<void> {
  assertTestDatabase(process.env['DATABASE_URL']);
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.request.deleteMany(),
    prisma.vehiclePositionHistory.deleteMany(),
    prisma.vehiclePosition.deleteMany(),
    prisma.vehicle.deleteMany(),
  ]);
}

beforeAll(async () => {
  assertTestDatabase(process.env['DATABASE_URL']);
  await resetData();
  await prisma.user.deleteMany();

  const dispatcher = await prisma.user.create({
    data: {
      name: 'Concurrency Dispatcher',
      email: 'dispatcher@concurrency.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: 'DISPATCHER',
    },
  });
  dispatcherId = dispatcher.id;

  server = createApp().listen(0);
  const login = await request(server)
    .post('/api/auth/login')
    .send({ email: 'dispatcher@concurrency.test', password: PASSWORD });
  expect(login.status).toBe(200);
  token = login.body.token;
});

afterAll(async () => {
  server?.close();
  await prisma.$disconnect();
});

describe('two concurrent assignment attempts for the same vehicle', () => {
  let vehicleId: string;
  let requestIds: [string, string];

  beforeEach(async () => {
    await resetData();

    const vehicle = await prisma.vehicle.create({
      data: {
        code: 'AMB-RACE',
        status: 'AVAILABLE',
        position: { create: { latitude: 23.0225, longitude: 72.5714, recordedAt: new Date() } },
      },
    });
    vehicleId = vehicle.id;

    // Same urgency, so neither holds the vehicle back from the other: both attempts'
    // rule evaluation picks AMB-RACE, the only available vehicle.
    const [a, b] = await Promise.all(
      ['Race Patient A', 'Race Patient B'].map((patientName) =>
        prisma.request.create({
          data: {
            patientName,
            address: 'Test address',
            latitude: 23.03,
            longitude: 72.58,
            urgency: 'ROUTINE',
            createdById: dispatcherId,
          },
        }),
      ),
    );
    requestIds = [a!.id, b!.id];
  });

  it.each(Array.from({ length: RUNS }, (_, i) => i + 1))(
    'run %i: exactly one succeeds, exactly one gets 409, and one ACTIVE row exists',
    async () => {
      const results = await Promise.allSettled(
        requestIds.map((id) => request(server).post(`/api/requests/${id}/assign`).set('Authorization', `Bearer ${token}`)),
      );

      const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : `rejected: ${String(r.reason)}`));
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);

      const activeRows = await prisma.assignment.count({ where: { vehicleId, status: 'ACTIVE' } });
      expect(activeRows).toBe(1);

      // The loser's request must be left untouched, not half-assigned.
      const states = await prisma.request.findMany({ where: { id: { in: requestIds } }, select: { state: true } });
      expect(states.map((s) => s.state).sort()).toEqual(['ASSIGNED', 'REQUESTED']);
    },
  );
});
