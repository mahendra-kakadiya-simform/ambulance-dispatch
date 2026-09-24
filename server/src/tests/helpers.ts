import bcrypt from 'bcryptjs';
import type { Server } from 'node:http';
import request from 'supertest';
import { prisma } from '../config/db.js';
import type { Role } from '../generated/prisma/enums.js';
import { assertTestDatabase } from './testDatabase.js';

export const TEST_PASSWORD = 'Passw0rd!';

/** Deletes every row, children first. Refuses to run against a non-*_test database. */
export async function resetDatabase(): Promise<void> {
  assertTestDatabase(process.env['DATABASE_URL']);
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.request.deleteMany(),
    prisma.vehiclePositionHistory.deleteMany(),
    prisma.vehiclePosition.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export async function createUser(role: Role, email: string, name = email): Promise<{ id: string; email: string }> {
  // Cost 4 instead of the app's 12: these hashes only need to be valid, not slow.
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const user = await prisma.user.create({ data: { name, email, passwordHash, role } });
  return { id: user.id, email: user.email };
}

/** Logs in through the real endpoint and returns the bearer token. */
export async function login(server: Server, email: string): Promise<string> {
  const res = await request(server).post('/api/auth/login').send({ email, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}
