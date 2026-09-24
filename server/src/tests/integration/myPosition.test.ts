/**
 * GET /api/vehicles/me/position — the driver screen reads this on load so the last saved
 * location survives a page refresh or a new login.
 */
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../config/db.js';
import { createUser, login, resetDatabase } from '../helpers.js';

let server: Server;
let driverToken: string;
let unlinkedDriverToken: string;
let dispatcherToken: string;

beforeAll(async () => {
  await resetDatabase();
  const [driver, unlinked, dispatcher] = await Promise.all([
    createUser('DRIVER', 'driver@mypos.test'),
    createUser('DRIVER', 'unlinked@mypos.test'),
    createUser('DISPATCHER', 'dispatcher@mypos.test'),
  ]);
  await prisma.vehicle.create({ data: { code: 'POS-01', status: 'AVAILABLE', driverId: driver.id } });

  server = createApp().listen(0);
  [driverToken, unlinkedDriverToken, dispatcherToken] = await Promise.all([
    login(server, driver.email),
    login(server, unlinked.email),
    login(server, dispatcher.email),
  ]);
});

afterAll(async () => {
  server?.close();
  await prisma.$disconnect();
});

const asDriver = (req: request.Test) => req.set('Authorization', `Bearer ${driverToken}`);

describe('a driver reading their own last saved position', () => {
  it('returns the vehicle with a null position before anything has been saved', async () => {
    const res = await asDriver(request(server).get('/api/vehicles/me/position'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ vehicle: { id: expect.any(String), code: 'POS-01' }, position: null });
  });

  it('returns the most recently saved coordinates, as a fresh page load would', async () => {
    await asDriver(request(server).post('/api/vehicles/me/position')).send({ latitude: 23.01, longitude: 72.51 });
    await asDriver(request(server).post('/api/vehicles/me/position')).send({ latitude: 23.02, longitude: 72.52 });

    const res = await asDriver(request(server).get('/api/vehicles/me/position'));
    expect(res.status).toBe(200);
    expect(res.body.position).toMatchObject({ latitude: 23.02, longitude: 72.52 });
    expect(new Date(res.body.position.recordedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('returns nulls for a driver with no vehicle linked', async () => {
    const res = await request(server)
      .get('/api/vehicles/me/position')
      .set('Authorization', `Bearer ${unlinkedDriverToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ vehicle: null, position: null });
  });

  it('is driver-only', async () => {
    const res = await request(server).get('/api/vehicles/me/position').set('Authorization', `Bearer ${dispatcherToken}`);
    expect(res.status).toBe(403);
  });
});
