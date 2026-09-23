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

// ---- vehicles ----

const VEHICLE_STATUSES = ['AVAILABLE', 'OUT_OF_SERVICE'] as const;

export const listVehiclesSchema = {
  query: z.object({
    status: z.enum(VEHICLE_STATUSES).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  }),
};

export const getVehicleSchema = {
  params: z.object({
    id: z.uuid(),
  }),
};

export const createVehicleSchema = {
  body: z.object({
    code: z.string().trim().min(1, 'Code is required'),
    status: z.enum(VEHICLE_STATUSES),
    // null / omitted = no driver linked.
    driverId: z.uuid().nullable().optional(),
  }),
};

export const updateVehicleSchema = {
  params: z.object({
    id: z.uuid(),
  }),
  body: z
    .object({
      code: z.string().trim().min(1).optional(),
      status: z.enum(VEHICLE_STATUSES).optional(),
      // null explicitly unlinks the current driver.
      driverId: z.uuid().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided',
    }),
};

// Deliberately has no vehicleId field: the vehicle is resolved from the token, and
// z.object() strips unknown keys, so a vehicleId in the body never reaches the service.
export const reportPositionSchema = {
  body: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
};

// ---- requests ----

const URGENCIES = ['CRITICAL', 'URGENT', 'ROUTINE'] as const;
const REQUEST_STATES = ['REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'CANCELLED'] as const;

// Accepts ?state=A&state=B (Express parses repeated keys into an array) as well as
// ?state=A,B, and normalises both to a de-duplicated array.
function multiValueQueryParam<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (raw) => {
      if (raw === undefined || raw === '') {
        return undefined;
      }
      const list = (Array.isArray(raw) ? raw : [raw]).flatMap((v) => String(v).split(','));
      return [...new Set(list.map((v) => v.trim()).filter(Boolean))];
    },
    z.array(z.enum(values)).min(1).optional(),
  );
}

export const createRequestSchema = {
  body: z.object({
    patientName: z.string().trim().min(1, 'Patient name is required'),
    address: z.string().trim().min(1, 'Address is required'),
    latitude: z.number('Latitude is required').min(-90).max(90),
    longitude: z.number('Longitude is required').min(-180).max(180),
    // Required with no default: urgency is decided by the dispatcher at intake, and a
    // request without one never gets past this schema — the service is never called.
    urgency: z.enum(URGENCIES, 'Urgency is required and must be CRITICAL, URGENT or ROUTINE'),
    description: z.string().trim().min(1).optional(),
  }),
};

export const getRequestSchema = {
  params: z.object({
    id: z.uuid(),
  }),
};

export const listRequestsSchema = {
  query: z.object({
    state: multiValueQueryParam(REQUEST_STATES),
    urgency: multiValueQueryParam(URGENCIES),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    sort: z.enum(['createdAt', 'urgency', 'state']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
};

export const assignRequestSchema = {
  params: z.object({
    id: z.uuid(),
  }),
};
