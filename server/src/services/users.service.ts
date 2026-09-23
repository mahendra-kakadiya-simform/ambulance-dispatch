import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import { prisma } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Role } from '../generated/prisma/enums.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import type { createUserSchema, listUsersSchema, updateUserSchema } from '../utils/validators.js';

const SALT_ROUNDS = 12;

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// The single place a Prisma User row is turned into API-facing JSON.
// passwordHash never leaves this function — every route funnels through it.
function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Derived from the Zod schema (not hand-duplicated) so the service's input type can
// never drift from what validate(listUsersSchema) actually produces.
type ListUsersParams = z.infer<typeof listUsersSchema.query>;

interface ListUsersResult {
  data: UserDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export async function listUsers(params: ListUsersParams): Promise<ListUsersResult> {
  const { role, isActive, search, page, pageSize, sort, order } = params;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.UserOrderByWithRelationInput = sort === 'name' ? { name: order } : { createdAt: order };

  // A single transaction: count(*) and the page of rows, both computed by Postgres —
  // filtering, sorting and paging all happen in the WHERE/ORDER BY/LIMIT/OFFSET clauses,
  // never by fetching everything and slicing it in Node. See config/db.ts's query log.
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: users.map(toUserDto),
    meta: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

type CreateUserInput = z.infer<typeof createUserSchema.body>;

export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: input.role },
    });
    return toUserDto(user);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('A user with this email already exists');
    }
    throw err;
  }
}

type UpdateUserInput = z.infer<typeof updateUserSchema.body>;

export async function updateUser(id: string, actorId: string, input: UpdateUserInput): Promise<UserDto> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  const isSelf = id === actorId;

  if (isSelf && input.isActive === false) {
    throw new ForbiddenError('You cannot deactivate your own account');
  }

  if (isSelf && input.role !== undefined && input.role !== existing.role) {
    throw new ForbiddenError('You cannot change your own role');
  }

  if (input.isActive === false) {
    const vehicle = await prisma.vehicle.findUnique({ where: { driverId: id } });
    if (vehicle) {
      const activeAssignment = await prisma.assignment.findFirst({
        where: { vehicleId: vehicle.id, status: 'ACTIVE' },
      });
      if (activeAssignment) {
        throw new ConflictError('Cannot deactivate a driver whose vehicle has an active assignment');
      }
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  return toUserDto(user);
}

export async function updateUserPassword(id: string, password: string): Promise<UserDto> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError('User not found');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.update({ where: { id }, data: { passwordHash } });
  return toUserDto(user);
}
