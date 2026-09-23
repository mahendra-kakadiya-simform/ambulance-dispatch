import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

const SALT_ROUNDS = 12;
const SEED_PASSWORD = 'Passw0rd!';

// Fixed ids so re-running the seed upserts the same demo requests instead of duplicating them.
const ROUTINE_REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const CRITICAL_REQUEST_ID = '22222222-2222-4222-8222-222222222222';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);

  const dispatcher = await prisma.user.upsert({
    where: { email: 'dispatcher@ambulance-dispatch.dev' },
    update: {},
    create: {
      name: 'Priya Shah',
      email: 'dispatcher@ambulance-dispatch.dev',
      passwordHash,
      role: 'DISPATCHER',
    },
  });

  const driverDefs = [
    { name: 'Aman Patel', email: 'driver.aman@ambulance-dispatch.dev' },
    { name: 'Rohit Mehta', email: 'driver.rohit@ambulance-dispatch.dev' },
    { name: 'Sana Sheikh', email: 'driver.sana@ambulance-dispatch.dev' },
  ];

  const drivers = [];
  for (const def of driverDefs) {
    const driver = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: { name: def.name, email: def.email, passwordHash, role: 'DRIVER' },
    });
    drivers.push(driver);
  }

  // All three vehicles start in Ahmedabad, a few km apart.
  const vehicleDefs = [
    {
      code: 'AMB-01',
      status: 'AVAILABLE' as const,
      driver: drivers[0]!,
      position: { latitude: 23.0225, longitude: 72.5714 }, // Ellisbridge
    },
    {
      code: 'AMB-02',
      // Closer to the critical demo request than AMB-01, but not free — the dispatcher can't use it.
      status: 'OUT_OF_SERVICE' as const,
      driver: drivers[1]!,
      position: { latitude: 23.0676, longitude: 72.5714 }, // Naranpura
    },
    {
      code: 'AMB-03',
      status: 'AVAILABLE' as const,
      driver: drivers[2]!,
      position: { latitude: 22.9925, longitude: 72.6014 }, // Maninagar
    },
  ];

  for (const def of vehicleDefs) {
    const vehicle = await prisma.vehicle.upsert({
      where: { code: def.code },
      update: { status: def.status, driverId: def.driver.id },
      create: { code: def.code, status: def.status, driverId: def.driver.id },
    });

    await prisma.vehiclePosition.upsert({
      where: { vehicleId: vehicle.id },
      update: { ...def.position, recordedAt: new Date() },
      create: { vehicleId: vehicle.id, ...def.position, recordedAt: new Date() },
    });
  }

  // ROUTINE request, ~2 km from AMB-01.
  await prisma.request.upsert({
    where: { id: ROUTINE_REQUEST_ID },
    update: {},
    create: {
      id: ROUTINE_REQUEST_ID,
      patientName: 'Ramesh Iyer',
      address: 'Near Law Garden, Ellisbridge, Ahmedabad',
      latitude: 23.0225,
      longitude: 72.591,
      urgency: 'ROUTINE',
      createdById: dispatcher.id,
    },
  });

  // CRITICAL request, ~8 km from AMB-01. AMB-02 is closer but out of service,
  // AMB-03 is available but further away — AMB-01 is the closest free vehicle.
  await prisma.request.upsert({
    where: { id: CRITICAL_REQUEST_ID },
    update: {},
    create: {
      id: CRITICAL_REQUEST_ID,
      patientName: 'Fatima Sheikh',
      address: 'Near SG Highway, Ahmedabad',
      latitude: 23.0946,
      longitude: 72.5714,
      urgency: 'CRITICAL',
      createdById: dispatcher.id,
    },
  });

  console.log('\nSeeded accounts (all use the same password):');
  console.log(`  password: ${SEED_PASSWORD}\n`);
  console.log(`  ${dispatcher.email.padEnd(35)} DISPATCHER`);
  for (const driver of drivers) {
    console.log(`  ${driver.email.padEnd(35)} DRIVER`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
