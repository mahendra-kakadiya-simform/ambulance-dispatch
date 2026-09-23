import type { z } from 'zod';
import { prisma } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { VehicleStatus } from '../generated/prisma/enums.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';
import type { createVehicleSchema, listVehiclesSchema, updateVehicleSchema } from '../utils/validators.js';

export interface VehicleDto {
  id: string;
  code: string;
  status: VehicleStatus;
  driverId: string | null;
  driver: { id: string; name: string } | null;
}

const vehicleInclude = {
  driver: { select: { id: true, name: true } },
} satisfies Prisma.VehicleInclude;

type VehicleRecord = Prisma.VehicleGetPayload<{ include: typeof vehicleInclude }>;

function toVehicleDto(vehicle: VehicleRecord): VehicleDto {
  return {
    id: vehicle.id,
    code: vehicle.code,
    status: vehicle.status,
    driverId: vehicle.driverId,
    driver: vehicle.driver ? { id: vehicle.driver.id, name: vehicle.driver.name } : null,
  };
}

type ListVehiclesParams = z.infer<typeof listVehiclesSchema.query>;

interface ListVehiclesResult {
  data: VehicleDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export async function listVehicles(params: ListVehiclesParams): Promise<ListVehiclesResult> {
  const { status, page, pageSize } = params;
  const where: Prisma.VehicleWhereInput = status ? { status } : {};

  const [total, vehicles] = await prisma.$transaction([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      include: vehicleInclude,
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: vehicles.map(toVehicleDto),
    meta: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

export async function getVehicle(id: string): Promise<VehicleDto> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id }, include: vehicleInclude });
  if (!vehicle) {
    throw new NotFoundError('Vehicle not found');
  }
  return toVehicleDto(vehicle);
}

// Enforces the two driver-link rules: the user must be a DRIVER (400), and must not
// already drive a different vehicle (409). `vehicleId` is the vehicle being edited, so
// re-saving a vehicle with its own current driver is not a conflict.
async function assertDriverLinkable(driverId: string, vehicleId?: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: driverId } });
  if (!user) {
    throw new ValidationError('Validation failed', { driverId: ['Driver not found'] });
  }
  if (user.role !== 'DRIVER') {
    throw new ValidationError('Validation failed', { driverId: ['Only users with the DRIVER role can be linked'] });
  }

  const linked = await prisma.vehicle.findUnique({ where: { driverId } });
  if (linked && linked.id !== vehicleId) {
    throw new ConflictError(`${user.name} is already linked to vehicle ${linked.code}`, {
      driverId: [`Already linked to vehicle ${linked.code}`],
    });
  }
}

// The pre-checks above give friendly messages; the unique constraints on vehicles.code
// and vehicles.driverId are what actually hold under concurrent writes.
function translateUniqueViolation(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = JSON.stringify(err.meta ?? {});
    if (target.includes('driverId')) {
      throw new ConflictError('This driver is already linked to another vehicle', {
        driverId: ['Already linked to another vehicle'],
      });
    }
    throw new ConflictError('A vehicle with this code already exists', { code: ['Code already in use'] });
  }
  throw err;
}

type CreateVehicleInput = z.infer<typeof createVehicleSchema.body>;

export async function createVehicle(input: CreateVehicleInput): Promise<VehicleDto> {
  if (input.driverId) {
    await assertDriverLinkable(input.driverId);
  }

  try {
    const vehicle = await prisma.vehicle.create({
      data: { code: input.code, status: input.status, driverId: input.driverId ?? null },
      include: vehicleInclude,
    });
    return toVehicleDto(vehicle);
  } catch (err) {
    translateUniqueViolation(err);
  }
}

type UpdateVehicleInput = z.infer<typeof updateVehicleSchema.body>;

export async function updateVehicle(id: string, input: UpdateVehicleInput): Promise<VehicleDto> {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('Vehicle not found');
  }

  if (input.driverId) {
    await assertDriverLinkable(input.driverId, id);
  }

  try {
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.driverId !== undefined ? { driverId: input.driverId } : {}),
      },
      include: vehicleInclude,
    });
    return toVehicleDto(vehicle);
  } catch (err) {
    translateUniqueViolation(err);
  }
}

// ---- positions ----

export interface PositionDto {
  vehicleId: string;
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

// The vehicle is resolved from the authenticated driver, never from the request body —
// a driver can only ever move the vehicle they are linked to.
export async function reportPosition(
  driverId: string,
  coords: { latitude: number; longitude: number },
): Promise<PositionDto> {
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId } });
  if (!vehicle) {
    throw new NotFoundError('No vehicle is linked to your account');
  }

  const recordedAt = new Date();
  const row = { latitude: coords.latitude, longitude: coords.longitude, recordedAt };

  // Upsert, not update: the first ping for a vehicle has no current row yet. The current
  // row and the history row are written together so the two tables can never disagree.
  const [position] = await prisma.$transaction([
    prisma.vehiclePosition.upsert({
      where: { vehicleId: vehicle.id },
      update: row,
      create: { vehicleId: vehicle.id, ...row },
    }),
    prisma.vehiclePositionHistory.create({
      data: { vehicleId: vehicle.id, ...row },
    }),
  ]);

  return position;
}

export interface LivePositionDto {
  vehicleId: string;
  code: string;
  status: VehicleStatus;
  driverName: string | null;
  latitude: number;
  longitude: number;
  recordedAt: Date;
}

export async function listCurrentPositions(): Promise<LivePositionDto[]> {
  // Reads ONLY the current-position table (vehicle_positions, one row per vehicle by
  // primary key) joined to vehicles and their driver — never vehicle_position_history.
  // History grows by one row per ping (~3.5M rows/day at 200 vehicles every 5s), so
  // deriving "latest per vehicle" from it would get slower every hour the system runs;
  // this query stays bounded by the number of vehicles.
  const positions = await prisma.vehiclePosition.findMany({
    include: {
      vehicle: {
        select: { code: true, status: true, driver: { select: { name: true } } },
      },
    },
    orderBy: { vehicle: { code: 'asc' } },
  });

  return positions.map((p) => ({
    vehicleId: p.vehicleId,
    code: p.vehicle.code,
    status: p.vehicle.status,
    driverName: p.vehicle.driver?.name ?? null,
    latitude: p.latitude,
    longitude: p.longitude,
    recordedAt: p.recordedAt,
  }));
}
