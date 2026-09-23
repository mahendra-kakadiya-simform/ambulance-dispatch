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
  driver: { id: string; name: string } | null;
}

// One row of GET /api/vehicles/positions — a vehicle's current position only.
export interface LivePosition {
  vehicleId: string;
  code: string;
  status: VehicleStatus;
  driverName: string | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface VehiclePosition {
  vehicleId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

export interface Request {
  id: string;
  patientName: string;
  address: string;
  latitude: number;
  longitude: number;
  urgency: Urgency;
  description: string | null;
  state: RequestState;
  version: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  activeAssignment: ActiveAssignment | null;
}

// Returned by POST /api/requests/:id/assign — the decision plus the reasoning behind it.
export interface AssignmentCandidate {
  vehicleId: string;
  code: string;
  distanceKm: number;
  chosen: boolean;
  // Set when this vehicle was passed over because a more urgent waiting request claims it.
  heldFor: { requestId: string; patientName: string; urgency: Urgency } | null;
}

export interface AssignResult {
  assignment: { id: string; vehicle: { id: string; code: string }; distanceKm: number };
  request: Request;
  candidates: AssignmentCandidate[];
}

export interface ActiveAssignment {
  id: string;
  createdAt: string;
  vehicle: { id: string; code: string; status: VehicleStatus };
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
