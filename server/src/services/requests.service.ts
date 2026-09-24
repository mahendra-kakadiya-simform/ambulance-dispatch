import type { z } from 'zod';
import { prisma } from '../config/db.js';
import { explainPick } from '../domain/assignmentRule.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AssignmentStatus, RequestState, Role, Urgency, VehicleStatus } from '../generated/prisma/enums.js';
import { assertTransition } from '../domain/stateMachine.js';
import { writeAudit } from '../lib/audit.js';
import { ConflictError, ForbiddenError, InvalidTransitionError, NotFoundError, ValidationError } from '../utils/errors.js';
import type {
  createRequestSchema,
  listRequestsSchema,
  requestHistorySchema,
  overrideAssignmentSchema,
  transitionRequestSchema,
} from '../utils/validators.js';

export interface Actor {
  id: string;
  role: Role;
}

export interface CurrentAssignmentDto {
  id: string;
  status: AssignmentStatus;
  createdAt: Date;
  // driver is whoever is linked to the vehicle now (driver links are not historical).
  vehicle: { id: string; code: string; status: VehicleStatus; driver: { id: string; name: string } | null };
}

export interface RequestDto {
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
  createdAt: Date;
  updatedAt: Date;
  currentAssignment: CurrentAssignmentDto | null;
}

// A request's current assignment is its latest ACTIVE one, or the COMPLETED one once
// it has ARRIVED. SUPERSEDED (overridden) and CANCELLED assignments are history only.
const CURRENT_ASSIGNMENT_STATUSES: AssignmentStatus[] = ['ACTIVE', 'COMPLETED'];

const requestInclude = {
  assignments: {
    where: { status: { in: CURRENT_ASSIGNMENT_STATUSES } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      status: true,
      createdAt: true,
      vehicle: { select: { id: true, code: true, status: true, driver: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.RequestInclude;

type RequestRecord = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;

function toRequestDto(request: RequestRecord): RequestDto {
  const current = request.assignments[0];
  return {
    id: request.id,
    patientName: request.patientName,
    address: request.address,
    latitude: request.latitude,
    longitude: request.longitude,
    urgency: request.urgency,
    description: request.description,
    state: request.state,
    version: request.version,
    createdById: request.createdById,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    currentAssignment: current
      ? { id: current.id, status: current.status, createdAt: current.createdAt, vehicle: current.vehicle }
      : null,
  };
}

type CreateRequestInput = z.infer<typeof createRequestSchema.body>;

export async function createRequest(actorId: string, input: CreateRequestInput): Promise<RequestDto> {
  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.request.create({
      data: {
        patientName: input.patientName,
        address: input.address,
        latitude: input.latitude,
        longitude: input.longitude,
        urgency: input.urgency,
        description: input.description ?? null,
        createdById: actorId,
        // state (REQUESTED) and version (1) come from the schema defaults.
      },
      include: requestInclude,
    });

    await writeAudit(tx, {
      actorId,
      entityType: 'Request',
      entityId: created.id,
      action: 'REQUEST_CREATED',
      toValue: created.state,
    });

    return created;
  });

  return toRequestDto(request);
}

// Resource-level authorization for drivers: a DRIVER may only touch a request whose
// current assignment is on the vehicle linked to them. The role check at the route only
// says "drivers may call this endpoint"; this says "this driver may see this request".
// A missing request and someone else's request get the same 403 with no request data,
// so a driver cannot even probe which request IDs exist.
const NO_ACCESS_MESSAGE = 'You do not have access to this request';

async function assertDriverOwnsRequest(
  db: Prisma.TransactionClient | typeof prisma,
  requestId: string,
  driverId: string,
): Promise<void> {
  const owned = await db.assignment.findFirst({
    where: {
      requestId,
      status: { in: CURRENT_ASSIGNMENT_STATUSES },
      vehicle: { driverId },
    },
    select: { id: true },
  });
  if (!owned) {
    throw new ForbiddenError(NO_ACCESS_MESSAGE);
  }
}

export async function getRequest(id: string, actor: Actor): Promise<RequestDto> {
  if (actor.role === 'DRIVER') {
    await assertDriverOwnsRequest(prisma, id, actor.id);
  }
  const request = await prisma.request.findUnique({ where: { id }, include: requestInclude });
  if (!request) {
    throw new NotFoundError('Request not found');
  }
  return toRequestDto(request);
}

// The request currently assigned to this driver's vehicle, or null if there is none.
export async function getDriverCurrentRequest(driverId: string): Promise<RequestDto | null> {
  const assignment = await prisma.assignment.findFirst({
    where: { status: 'ACTIVE', vehicle: { driverId } },
    select: { request: { include: requestInclude } },
  });
  return assignment ? toRequestDto(assignment.request) : null;
}

type ListRequestsParams = z.infer<typeof listRequestsSchema.query>;

interface ListRequestsResult {
  data: RequestDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

function buildOrderBy(
  sort: ListRequestsParams['sort'],
  order: ListRequestsParams['order'],
): Prisma.RequestOrderByWithRelationInput[] {
  switch (sort) {
    case 'urgency':
      // Postgres sorts an enum column by the order its values were declared in the
      // CREATE TYPE, not alphabetically: CRITICAL < URGENT < ROUTINE (see schema.prisma).
      // So ORDER BY urgency ASC is already "most urgent first" — no CASE expression and
      // no extra rank column needed. `order` here means priority, so the default `desc`
      // (highest priority first) maps to the enum's ASC. The catch: reordering the enum
      // values in schema.prisma would silently change this sort.
      // Ties go oldest-first, so the request that has waited longest surfaces first.
      return [{ urgency: order === 'desc' ? 'asc' : 'desc' }, { createdAt: 'asc' }, { id: 'asc' }];
    case 'state':
      // Same enum-declaration ordering: REQUESTED → ASSIGNED → EN_ROUTE → ARRIVED → CANCELLED.
      return [{ state: order }, { createdAt: 'desc' }, { id: 'asc' }];
    case 'createdAt':
      return [{ createdAt: order }, { id: 'asc' }];
  }
}

export async function listRequests(params: ListRequestsParams): Promise<ListRequestsResult> {
  const { state, urgency, page, pageSize, sort, order } = params;

  const where: Prisma.RequestWhereInput = {
    ...(state ? { state: { in: state } } : {}),
    ...(urgency ? { urgency: { in: urgency } } : {}),
  };

  // Filtering, sorting and paging are all WHERE / ORDER BY / LIMIT / OFFSET in Postgres —
  // see the query log in development (config/db.ts).
  const [total, requests] = await prisma.$transaction([
    prisma.request.count({ where }),
    prisma.request.findMany({
      where,
      include: requestInclude,
      orderBy: buildOrderBy(sort, order),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: requests.map(toRequestDto),
    meta: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

// ---- assignment ----

export interface AssignmentCandidateDto {
  vehicleId: string;
  code: string;
  distanceKm: number;
  chosen: boolean;
  heldFor: { requestId: string; patientName: string; urgency: Urgency } | null;
}

export interface AssignResult {
  assignment: { id: string; vehicle: { id: string; code: string }; distanceKm: number };
  request: RequestDto;
  candidates: AssignmentCandidateDto[];
}

function formatKm(km: number): string {
  return `${km.toFixed(2)} km`;
}

export async function assignRequest(requestId: string, actorId: string): Promise<AssignResult> {
  // Remembered outside the transaction so the P2002 handler below can name the vehicle.
  let attemptedVehicleCode: string | null = null;

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. The request must still be waiting.
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundError('Request not found');
      }
      if (request.state !== 'REQUESTED') {
        throw new ConflictError(`Request is already ${request.state} and cannot be assigned`);
      }
      assertTransition(request.state, 'ASSIGNED');

      // 2. Candidate vehicles: AVAILABLE, with a known current position, and not already
      //    on an ACTIVE assignment. This read is only a snapshot — another transaction can
      //    take one of these vehicles a moment later; step 4's unique index is what holds.
      const vehicles = await tx.vehicle.findMany({
        where: {
          status: 'AVAILABLE',
          position: { isNot: null },
          assignments: { none: { status: 'ACTIVE' } },
        },
        select: { id: true, code: true, position: { select: { latitude: true, longitude: true } } },
      });
      const available = vehicles.flatMap((v) =>
        v.position ? [{ id: v.id, code: v.code, latitude: v.position.latitude, longitude: v.position.longitude }] : [],
      );

      // Other waiting requests: a more urgent one has first claim on its nearest vehicle.
      const waiting = await tx.request.findMany({
        where: { state: 'REQUESTED', id: { not: request.id } },
        select: { id: true, urgency: true, latitude: true, longitude: true, patientName: true },
      });
      const waitingById = new Map(waiting.map((w) => [w.id, w]));

      // 3. The decision is made entirely by the pure rule — no comparisons in this layer.
      const { chosen, candidates } = explainPick(request, available, waiting);
      if (!chosen) {
        throw new ConflictError(
          available.length === 0
            ? 'No vehicle is available right now'
            : 'Every available vehicle is held for a more urgent waiting request',
        );
      }
      attemptedVehicleCode = chosen.vehicle.code;

      // 4. Claim the vehicle. The partial unique index one_active_assignment_per_vehicle
      //    rejects this insert (P2002) if another transaction has claimed the same vehicle.
      const assignment = await tx.assignment.create({
        data: { requestId: request.id, vehicleId: chosen.vehicle.id, status: 'ACTIVE', assignedById: actorId },
      });

      // 5. Move the request on, guarded on the version we read in step 1. If a concurrent
      //    call assigned this same request (to a different vehicle) and committed first,
      //    this matches zero rows and the whole transaction, including step 4, rolls back.
      const moved = await tx.request.updateMany({
        where: { id: request.id, state: 'REQUESTED', version: request.version },
        data: { state: 'ASSIGNED', version: { increment: 1 } },
      });
      if (moved.count !== 1) {
        throw new ConflictError('This request was just changed by someone else — refresh and try again');
      }

      // 6. Audit with enough detail to reconstruct the decision later.
      const passedOver = candidates
        .filter((c) => c.heldFor && c.distanceKm < chosen.distanceKm)
        .map((c) => {
          const holder = c.heldFor ? waitingById.get(c.heldFor.id) : undefined;
          return `${c.vehicle.code} (${formatKm(c.distanceKm)}, held for ${holder?.urgency ?? ''} request ${holder?.patientName ?? c.heldFor?.id})`;
        });
      await writeAudit(tx, {
        actorId,
        entityType: 'Request',
        entityId: request.id,
        action: 'VEHICLE_ASSIGNED',
        fromValue: 'REQUESTED',
        toValue: 'ASSIGNED',
        reason:
          `${chosen.vehicle.code} chosen at ${formatKm(chosen.distanceKm)} for ${request.urgency} request.` +
          (passedOver.length > 0 ? ` Nearer vehicles passed over: ${passedOver.join('; ')}.` : ''),
      });

      const updated = await tx.request.findUniqueOrThrow({ where: { id: request.id }, include: requestInclude });

      return {
        assignment: {
          id: assignment.id,
          vehicle: { id: chosen.vehicle.id, code: chosen.vehicle.code },
          distanceKm: chosen.distanceKm,
        },
        request: toRequestDto(updated),
        candidates: candidates.map((c) => {
          const holder = c.heldFor ? waitingById.get(c.heldFor.id) : undefined;
          return {
            vehicleId: c.vehicle.id,
            code: c.vehicle.code,
            distanceKm: c.distanceKm,
            chosen: c.chosen,
            heldFor: holder ? { requestId: holder.id, patientName: holder.patientName, urgency: holder.urgency } : null,
          };
        }),
      };
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      JSON.stringify(err.meta ?? {}).includes('one_active_assignment_per_vehicle')
    ) {
      // attemptedVehicleCode is always set by now: P2002 can only come from the step-4 insert.
      throw new ConflictError(`Vehicle ${attemptedVehicleCode} was just taken by another assignment — refresh and try again`);
    }
    throw err;
  }
}

// ---- state transitions ----

type TransitionInput = z.infer<typeof transitionRequestSchema.body>;

function isUniqueViolation(err: unknown, constraint: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    JSON.stringify(err.meta ?? {}).includes(constraint)
  );
}

export async function transitionRequest(requestId: string, actor: Actor, input: TransitionInput): Promise<RequestDto> {
  const { toState, version, reason } = input;

  try {
    return await prisma.$transaction(async (tx) => {
      // Ownership is checked here in the service, inside the transaction, rather than in
      // the route handler: every caller of transitionRequest gets it (a future route, a
      // job, a test), and it is evaluated against the same snapshot the update uses.
      if (actor.role === 'DRIVER') {
        await assertDriverOwnsRequest(tx, requestId, actor.id);
      }

      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundError('Request not found');
      }

      // Optimistic concurrency: the client must prove it saw the latest version.
      if (request.version !== version) {
        throw new ConflictError(
          'This request was changed by someone else since you loaded it — refresh to see the latest state',
          { currentVersion: request.version, currentState: request.state },
        );
      }

      assertTransition(request.state, toState, reason);

      // Assigning needs a vehicle, which only the assign endpoint chooses.
      if (request.state === 'REQUESTED' && toState === 'ASSIGNED') {
        throw new InvalidTransitionError('Use the assign action to assign a vehicle to this request');
      }
      if (toState === 'CANCELLED' && actor.role === 'DRIVER') {
        throw new ForbiddenError('Only dispatch can cancel a request');
      }

      const assignment = await tx.assignment.findFirst({
        where: { requestId, status: { in: CURRENT_ASSIGNMENT_STATUSES } },
        orderBy: { createdAt: 'desc' },
      });
      if (!assignment && request.state !== 'REQUESTED') {
        throw new ConflictError(`Request is ${request.state} but has no current assignment`);
      }

      const moved = await tx.request.updateMany({
        where: { id: requestId, version },
        data: { state: toState, version: { increment: 1 } },
      });
      if (moved.count !== 1) {
        throw new ConflictError('This request was changed by someone else since you loaded it — refresh to see the latest state');
      }

      // Keep the assignment in step with the request.
      if (assignment) {
        if (toState === 'ARRIVED') {
          await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'COMPLETED' } });
        } else if (request.state === 'ARRIVED' && toState === 'EN_ROUTE') {
          // Re-opening a completed job puts the vehicle back on it; the partial unique
          // index rejects this if the vehicle has been given another job since.
          await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'ACTIVE' } });
        } else if (toState === 'CANCELLED') {
          await tx.assignment.update({ where: { id: assignment.id }, data: { status: 'CANCELLED' } });
        }
      }

      await writeAudit(tx, {
        actorId: actor.id,
        entityType: 'Request',
        entityId: requestId,
        action: 'STATE_CHANGED',
        fromValue: request.state,
        toValue: toState,
        reason: reason?.trim() || null,
      });

      const updated = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude });
      return toRequestDto(updated);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'one_active_assignment_per_vehicle')) {
      throw new ConflictError('That vehicle is already on another assignment, so this job cannot be reopened for it');
    }
    throw err;
  }
}

// ---- override ----

type OverrideInput = z.infer<typeof overrideAssignmentSchema.body>;

export async function overrideAssignment(requestId: string, actorId: string, input: OverrideInput): Promise<RequestDto> {
  const reason = input.reason.trim();
  let targetCode: string | null = null;

  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.request.findUnique({ where: { id: requestId } });
      if (!request) {
        throw new NotFoundError('Request not found');
      }
      if (request.state !== 'ASSIGNED') {
        throw new ConflictError(`Only an ASSIGNED request can be overridden; this one is ${request.state}`);
      }

      const current = await tx.assignment.findFirst({
        where: { requestId, status: 'ACTIVE' },
        include: { vehicle: { select: { code: true } } },
      });
      if (!current) {
        throw new ConflictError('Request has no active assignment to override');
      }

      const target = await tx.vehicle.findUnique({ where: { id: input.vehicleId } });
      if (!target) {
        throw new ValidationError('Validation failed', { vehicleId: ['Vehicle not found'] });
      }
      targetCode = target.code;
      if (target.id === current.vehicleId) {
        throw new ValidationError('Validation failed', { vehicleId: [`${target.code} is already assigned to this request`] });
      }
      if (target.status !== 'AVAILABLE') {
        throw new ConflictError(`${target.code} is out of service`, { vehicleId: [`${target.code} is out of service`] });
      }

      // Old row first, new row second; the new row links back to the one it replaces.
      await tx.assignment.update({ where: { id: current.id }, data: { status: 'SUPERSEDED' } });
      // The partial unique index still guards the target vehicle: if it is on another
      // ACTIVE assignment (or gets one concurrently), this insert fails with P2002.
      await tx.assignment.create({
        data: {
          requestId,
          vehicleId: target.id,
          status: 'ACTIVE',
          assignedById: actorId,
          overriddenFromId: current.id,
          overrideReason: reason,
        },
      });

      // Bump the version so a driver screen still showing the old vehicle cannot act on it.
      const moved = await tx.request.updateMany({
        where: { id: requestId, version: request.version },
        data: { version: { increment: 1 } },
      });
      if (moved.count !== 1) {
        throw new ConflictError('This request was changed by someone else — refresh and try again');
      }

      await writeAudit(tx, {
        actorId,
        entityType: 'Request',
        entityId: requestId,
        action: 'ASSIGNMENT_OVERRIDDEN',
        fromValue: current.vehicle.code,
        toValue: target.code,
        reason,
      });

      const updated = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: requestInclude });
      return toRequestDto(updated);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'one_active_assignment_per_vehicle')) {
      throw new ConflictError(`${targetCode} is already on another assignment — choose a different vehicle`, {
        vehicleId: [`${targetCode} was just taken`],
      });
    }
    throw err;
  }
}

// ---- history ----

export interface HistoryEntryDto {
  id: string;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  reason: string | null;
  createdAt: Date;
  actor: { id: string; name: string; role: Role };
}

interface HistoryResult {
  data: HistoryEntryDto[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

type HistoryParams = z.infer<typeof requestHistorySchema.query>;

/** The request's full audit trail, oldest first. Drivers may only read their own request's. */
export async function getRequestHistory(requestId: string, actor: Actor, params: HistoryParams): Promise<HistoryResult> {
  if (actor.role === 'DRIVER') {
    await assertDriverOwnsRequest(prisma, requestId, actor.id);
  }
  const exists = await prisma.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!exists) {
    throw new NotFoundError('Request not found');
  }

  const { page, pageSize } = params;
  const where: Prisma.AuditEventWhereInput = { entityType: 'Request', entityId: requestId };

  const [total, events] = await prisma.$transaction([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { id: true, name: true, role: true } } },
      // Served by the (entityType, entityId) index. id breaks ties between rows written
      // in the same millisecond so pages never overlap or skip.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: events.map((e) => ({
      id: e.id,
      action: e.action,
      fromValue: e.fromValue,
      toValue: e.toValue,
      reason: e.reason,
      createdAt: e.createdAt,
      actor: e.actor,
    })),
    meta: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
  };
}
