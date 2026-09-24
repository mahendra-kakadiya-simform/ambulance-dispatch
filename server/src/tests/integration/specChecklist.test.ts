/**
 * The spec's test checklist items that the other suites did not already cover:
 *   - a request created without an urgency level is rejected before business logic
 *   - an assignment referencing a vehicle that does not exist is rejected
 *   - an invalid state transition is rejected (through the API, not just the pure rule)
 *   - every mutation is tied to the authenticated user who made it
 * (Concurrency: assignConcurrency.test.ts. Driver A vs driver B: authorization.test.ts.)
 */
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../config/db.js';
import { createUser, login, resetDatabase } from '../helpers.js';

let server: Server;
let dispatcher: { id: string; email: string; token: string };
let driver: { id: string; email: string; token: string };

beforeAll(async () => {
  await resetDatabase();
  const d = await createUser('DISPATCHER', 'dispatcher@checklist.test');
  const r = await createUser('DRIVER', 'driver@checklist.test');
  server = createApp().listen(0);
  dispatcher = { ...d, token: await login(server, d.email) };
  driver = { ...r, token: await login(server, r.email) };
});

afterAll(async () => {
  server?.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.$transaction([
    prisma.auditEvent.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.request.deleteMany(),
    prisma.vehiclePosition.deleteMany(),
    prisma.vehicle.deleteMany(),
  ]);
  vi.restoreAllMocks();
});

const asDispatcher = (req: request.Test) => req.set('Authorization', `Bearer ${dispatcher.token}`);

async function createVehicle(code: string, latitude: number, longitude: number, driverId?: string) {
  return prisma.vehicle.create({
    data: {
      code,
      status: 'AVAILABLE',
      driverId: driverId ?? null,
      position: { create: { latitude, longitude, recordedAt: new Date() } },
    },
  });
}

describe('a request created without an urgency level', () => {
  it('is rejected with a 400 on the urgency field before any business logic runs', async () => {
    // createRequest opens a transaction first thing; if validation works, it never gets there.
    const transactionSpy = vi.spyOn(prisma, '$transaction');

    const res = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'No Urgency',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.urgency).toBeDefined();
    expect(transactionSpy).not.toHaveBeenCalled();
    expect(await prisma.request.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it('an urgency outside the three enum values is rejected the same way', async () => {
    const res = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'Bad Urgency',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
      urgency: 'HIGH',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.urgency).toBeDefined();
    expect(await prisma.request.count()).toBe(0);
  });
});

describe('an assignment referencing a vehicle that does not exist', () => {
  it('is rejected, and the existing assignment is left untouched', async () => {
    const vehicle = await createVehicle('CHK-01', 23.03, 72.57);
    const created = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'Override Target',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
      urgency: 'URGENT',
    });
    const requestId = created.body.request.id as string;
    expect((await asDispatcher(request(server).post(`/api/requests/${requestId}/assign`))).status).toBe(201);

    const res = await asDispatcher(request(server).post(`/api/requests/${requestId}/override`)).send({
      vehicleId: '00000000-0000-4000-8000-000000000000',
      reason: 'Testing a vehicle that does not exist',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details.vehicleId).toEqual(['Vehicle not found']);
    const assignments = await prisma.assignment.findMany({ where: { requestId } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({ vehicleId: vehicle.id, status: 'ACTIVE' });
  });
});

describe('an invalid state transition through the API', () => {
  it('REQUESTED -> ARRIVED is rejected with 409 INVALID_TRANSITION and changes nothing', async () => {
    const created = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'Skip Ahead',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
      urgency: 'ROUTINE',
    });
    const requestId = created.body.request.id as string;

    const res = await asDispatcher(request(server).patch(`/api/requests/${requestId}/state`)).send({
      toState: 'ARRIVED',
      version: 1,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.message).toMatch(/REQUESTED to ARRIVED/);
    const after = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    expect(after).toMatchObject({ state: 'REQUESTED', version: 1 });
    expect(await prisma.auditEvent.count({ where: { action: 'STATE_CHANGED' } })).toBe(0);
  });

  it('a backward transition without a reason is rejected', async () => {
    await createVehicle('CHK-02', 23.03, 72.57);
    const created = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'Backward',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
      urgency: 'ROUTINE',
    });
    const requestId = created.body.request.id as string;
    await asDispatcher(request(server).post(`/api/requests/${requestId}/assign`));
    await asDispatcher(request(server).patch(`/api/requests/${requestId}/state`)).send({ toState: 'EN_ROUTE', version: 2 });

    const res = await asDispatcher(request(server).patch(`/api/requests/${requestId}/state`)).send({
      toState: 'ASSIGNED',
      version: 3,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect((await prisma.request.findUniqueOrThrow({ where: { id: requestId } })).state).toBe('EN_ROUTE');
  });
});

describe('every mutation is tied to the authenticated user', () => {
  it('create, assign, override and transitions record the caller as the actor', async () => {
    await createVehicle('CHK-NEAR', 23.03, 72.57);
    const far = await createVehicle('CHK-FAR', 23.2, 72.7, driver.id);

    const created = await asDispatcher(request(server).post('/api/requests')).send({
      patientName: 'Actor Trail',
      address: 'Somewhere',
      latitude: 23.03,
      longitude: 72.57,
      urgency: 'CRITICAL',
    });
    const requestId = created.body.request.id as string;
    expect((await asDispatcher(request(server).post(`/api/requests/${requestId}/assign`))).status).toBe(201);
    const override = await asDispatcher(request(server).post(`/api/requests/${requestId}/override`)).send({
      vehicleId: far.id,
      reason: 'Near crew is on a break',
    });
    expect(override.status).toBe(200);
    // The driver of the new vehicle moves it on — their own id must be recorded, not dispatch's.
    const driverMove = await request(server)
      .patch(`/api/requests/${requestId}/state`)
      .set('Authorization', `Bearer ${driver.token}`)
      .send({ toState: 'EN_ROUTE', version: override.body.request.version });
    expect(driverMove.status).toBe(200);

    const stored = await prisma.request.findUniqueOrThrow({ where: { id: requestId } });
    expect(stored.createdById).toBe(dispatcher.id);

    const assignments = await prisma.assignment.findMany({ where: { requestId } });
    expect(assignments).toHaveLength(2);
    for (const a of assignments) {
      expect(a.assignedById).toBe(dispatcher.id);
    }

    const audit = await prisma.auditEvent.findMany({
      where: { entityId: requestId },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorId: true },
    });
    expect(audit).toEqual([
      { action: 'REQUEST_CREATED', actorId: dispatcher.id },
      { action: 'VEHICLE_ASSIGNED', actorId: dispatcher.id },
      { action: 'ASSIGNMENT_OVERRIDDEN', actorId: dispatcher.id },
      { action: 'STATE_CHANGED', actorId: driver.id },
    ]);
  });
});
