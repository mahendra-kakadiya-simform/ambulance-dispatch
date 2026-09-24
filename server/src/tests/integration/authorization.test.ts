/**
 * Authorization rules the spec checks explicitly, exercised through the real app and a
 * real Postgres test database (see ../testDatabase.ts).
 *
 * Fixture: two drivers, each linked to their own vehicle, each with one ASSIGNED request.
 */
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../config/db.js';
import { createUser, login, resetDatabase } from '../helpers.js';

let server: Server;
const tokens = { admin: '', dispatcher: '', driverA: '', driverB: '' };
let requestA: { id: string; version: number };
let requestB: { id: string; version: number; patientName: string; address: string };
let vehicleBCode: string;

async function createAssignedRequest(
  vehicleId: string,
  dispatcherId: string,
  patientName: string,
  address: string,
): Promise<{ id: string; version: number; patientName: string; address: string }> {
  const created = await prisma.request.create({
    data: { patientName, address, latitude: 23.03, longitude: 72.57, urgency: 'URGENT', state: 'ASSIGNED', version: 2, createdById: dispatcherId },
  });
  await prisma.assignment.create({
    data: { requestId: created.id, vehicleId, status: 'ACTIVE', assignedById: dispatcherId },
  });
  return { id: created.id, version: created.version, patientName, address };
}

beforeAll(async () => {
  await resetDatabase();

  const [admin, dispatcher, driverA, driverB] = await Promise.all([
    createUser('SUPER_ADMIN', 'admin@authz.test'),
    createUser('DISPATCHER', 'dispatcher@authz.test'),
    createUser('DRIVER', 'driver.a@authz.test'),
    createUser('DRIVER', 'driver.b@authz.test'),
  ]);

  const vehicleA = await prisma.vehicle.create({ data: { code: 'AUTHZ-A', status: 'AVAILABLE', driverId: driverA.id } });
  const vehicleB = await prisma.vehicle.create({ data: { code: 'AUTHZ-B', status: 'AVAILABLE', driverId: driverB.id } });
  vehicleBCode = vehicleB.code;

  requestA = await createAssignedRequest(vehicleA.id, dispatcher.id, 'Patient Of Driver A', '1 Alpha Road');
  requestB = await createAssignedRequest(vehicleB.id, dispatcher.id, 'Patient Of Driver B', '2 Bravo Street');

  server = createApp().listen(0);
  [tokens.admin, tokens.dispatcher, tokens.driverA, tokens.driverB] = await Promise.all([
    login(server, admin.email),
    login(server, dispatcher.email),
    login(server, driverA.email),
    login(server, driverB.email),
  ]);
});

afterAll(async () => {
  server?.close();
  await prisma.$disconnect();
});

type Method = 'get' | 'post' | 'patch';
const SOME_ID = '00000000-0000-4000-8000-000000000000';

describe('(a) every protected route returns 401 with no token', () => {
  const routes: Array<[Method, string]> = [
    ['get', '/api/auth/me'],
    ['get', '/api/users'],
    ['post', '/api/users'],
    ['patch', `/api/users/${SOME_ID}`],
    ['patch', `/api/users/${SOME_ID}/password`],
    ['get', '/api/vehicles'],
    ['post', '/api/vehicles'],
    ['get', `/api/vehicles/${SOME_ID}`],
    ['patch', `/api/vehicles/${SOME_ID}`],
    ['get', '/api/vehicles/positions'],
    ['get', '/api/vehicles/me/position'],
    ['post', '/api/vehicles/me/position'],
    ['get', '/api/requests'],
    ['post', '/api/requests'],
    ['get', `/api/requests/${SOME_ID}`],
    ['post', `/api/requests/${SOME_ID}/assign`],
    ['post', `/api/requests/${SOME_ID}/override`],
    ['patch', `/api/requests/${SOME_ID}/state`],
    ['get', `/api/requests/${SOME_ID}/history`],
    ['get', '/api/drivers/me/request'],
  ];

  it.each(routes)('%s %s', async (method, path) => {
    const res = await request(server)[method](path).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });
});

describe('(b) a driver calling a dispatcher-only route gets 403', () => {
  const routes: Array<[Method, string, object]> = [
    ['get', '/api/requests', {}],
    ['post', '/api/requests', { patientName: 'x', address: 'y', latitude: 1, longitude: 1, urgency: 'ROUTINE' }],
    ['post', `/api/requests/${SOME_ID}/assign`, {}],
    ['post', `/api/requests/${SOME_ID}/override`, { vehicleId: SOME_ID, reason: 'x' }],
    ['get', '/api/vehicles/positions', {}],
    ['post', '/api/vehicles', { code: 'X', status: 'AVAILABLE' }],
    ['get', '/api/users', {}],
  ];

  it.each(routes)('%s %s', async (method, path, body) => {
    const res = await request(server)[method](path).set('Authorization', `Bearer ${tokens.driverA}`).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('(c) SPEC: driver A requesting driver B\'s request by its exact ID', () => {
  it('returns 403, and the error body contains no part of that request\'s data', async () => {
    const res = await request(server)
      .get(`/api/requests/${requestB.id}`)
      .set('Authorization', `Bearer ${tokens.driverA}`);

    expect(res.status).toBe(403);
    // The whole body is a fixed error shape — nothing request-specific can be in it...
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this request', details: null },
    });
    // ...and, checked independently, none of driver B's request data appears anywhere.
    const raw = res.text;
    for (const secret of [requestB.id, requestB.patientName, requestB.address, vehicleBCode]) {
      expect(raw).not.toContain(secret);
    }
  });

  it('a request ID that does not exist gets the identical 403, so IDs cannot be probed', async () => {
    const res = await request(server).get(`/api/requests/${SOME_ID}`).set('Authorization', `Bearer ${tokens.driverA}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'You do not have access to this request', details: null },
    });
  });

  it('the same 403 applies to that request\'s history', async () => {
    const res = await request(server)
      .get(`/api/requests/${requestB.id}/history`)
      .set('Authorization', `Bearer ${tokens.driverA}`);
    expect(res.status).toBe(403);
    expect(res.text).not.toContain(requestB.patientName);
  });

  it('control: driver B can read their own request by the same ID', async () => {
    const res = await request(server).get(`/api/requests/${requestB.id}`).set('Authorization', `Bearer ${tokens.driverB}`);
    expect(res.status).toBe(200);
    expect(res.body.request.patientName).toBe(requestB.patientName);
  });

  it('control: driver A can read their own request', async () => {
    const res = await request(server).get(`/api/requests/${requestA.id}`).set('Authorization', `Bearer ${tokens.driverA}`);
    expect(res.status).toBe(200);
  });
});

describe('(d) driver A attempting a state transition on driver B\'s request', () => {
  it('returns 403 and changes nothing', async () => {
    const res = await request(server)
      .patch(`/api/requests/${requestB.id}/state`)
      .set('Authorization', `Bearer ${tokens.driverA}`)
      .send({ toState: 'EN_ROUTE', version: requestB.version });

    expect(res.status).toBe(403);
    expect(res.text).not.toContain(requestB.patientName);

    const after = await prisma.request.findUniqueOrThrow({ where: { id: requestB.id } });
    expect(after.state).toBe('ASSIGNED');
    expect(after.version).toBe(requestB.version);
    expect(await prisma.auditEvent.count({ where: { entityId: requestB.id } })).toBe(0);
  });

  it('control: driver B can make the same transition on their own request', async () => {
    const res = await request(server)
      .patch(`/api/requests/${requestB.id}/state`)
      .set('Authorization', `Bearer ${tokens.driverB}`)
      .send({ toState: 'EN_ROUTE', version: requestB.version });

    expect(res.status).toBe(200);
    expect(res.body.request.state).toBe('EN_ROUTE');
  });
});
