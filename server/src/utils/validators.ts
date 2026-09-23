import { z } from 'zod';

// One validators file per the task-management layout — grouped by feature as it grows.

// ---- auth ----

export const loginSchema = {
  body: z.object({
    email: z.email(),
    password: z.string().min(1, 'Password is required'),
  }),
};

// ---- users ----

const ROLES = ['SUPER_ADMIN', 'DISPATCHER', 'DRIVER'] as const;

// Query-string booleans arrive as the literal strings "true"/"false" — z.coerce.boolean()
// would treat "false" as truthy (any non-empty string coerces to true), so this maps
// explicitly instead.
const booleanQueryParam = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

export const listUsersSchema = {
  query: z.object({
    role: z.enum(ROLES).optional(),
    isActive: booleanQueryParam,
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    // The allowlist that keeps ?sort=passwordHash (or anything else) from reaching the DB query.
    sort: z.enum(['createdAt', 'name']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
};

export const createUserSchema = {
  body: z.object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(ROLES),
  }),
};

export const updateUserSchema = {
  params: z.object({
    id: z.uuid(),
  }),
  body: z
    .object({
      name: z.string().trim().min(1).optional(),
      role: z.enum(ROLES).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
};

export const updateUserPasswordSchema = {
  params: z.object({
    id: z.uuid(),
  }),
  body: z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
};
