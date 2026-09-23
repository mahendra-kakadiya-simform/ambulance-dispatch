// Mirrors server/prisma/schema.prisma exactly. Import everything from here —
// no inline string literals for roles/statuses/states anywhere in components.
//
// These are plain `as const` objects rather than TS `enum`/`const enum`: the
// client tsconfig has `erasableSyntaxOnly`, which rejects real enum syntax
// (it isn't erasable — it emits runtime code), and Vite's isolatedModules
// transpilation can't support `const enum` either. This is the same pattern
// the backend's generated Prisma client already uses for its enums.

export const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DISPATCHER: 'DISPATCHER',
  DRIVER: 'DRIVER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const VehicleStatus = {
  AVAILABLE: 'AVAILABLE',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
} as const;
export type VehicleStatus = (typeof VehicleStatus)[keyof typeof VehicleStatus];

export const Urgency = {
  CRITICAL: 'CRITICAL',
  URGENT: 'URGENT',
  ROUTINE: 'ROUTINE',
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

export const RequestState = {
  REQUESTED: 'REQUESTED',
  ASSIGNED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  ARRIVED: 'ARRIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequestState = (typeof RequestState)[keyof typeof RequestState];

export const AssignmentStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus];

// DTO shapes — as they arrive over JSON (timestamps are ISO strings, never Date),
// and never carrying passwordHash.

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// What auth endpoints (/api/auth/login, /api/auth/me) actually return — a subset of User.
export type AuthUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;

export interface Vehicle {
  id: string;
  code: string;
  status: VehicleStatus;
  driverId: string | null;
}

export interface Request {
  id: string;
  patientName: string;
  address: string;
  latitude: number;
  longitude: number;
  urgency: Urgency;
  state: RequestState;
  version: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  createdAt: string;
}
