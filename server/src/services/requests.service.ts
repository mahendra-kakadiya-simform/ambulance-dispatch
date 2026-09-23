import type { z } from 'zod';
import { prisma } from '../config/db.js';
import { explainPick } from '../domain/assignmentRule.js';
import { Prisma } from '../generated/prisma/client.js';
import type { RequestState, Urgency, VehicleStatus } from '../generated/prisma/enums.js';
import { writeAudit } from '../lib/audit.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import type { createRequestSchema, listRequestsSchema } from '../utils/validators.js';

export interface ActiveAssignmentDto {
  id: string;
  createdAt: Date;
  vehicle: { id: string; code: string; status: VehicleStatus };
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
  activeAssignment: ActiveAssignmentDto | null;
}

// At most one ACTIVE assignment exists per request at a time (older ones become
// SUPERSEDED/COMPLETED), so `take: 1` loads exactly the current one.
const requestInclude = {
  assignments: {
    where: { status: 'ACTIVE' },
    take: 1,
    select: {
      id: true,
      createdAt: true,
      vehicle: { select: { id: true, code: true, status: true } },
    },
  },
} satisfies Prisma.RequestInclude;

type RequestRecord = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;

function toRequestDto(request: RequestRecord): RequestDto {
  const active = request.assignments[0];
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
    activeAssignment: active ? { id: active.id, createdAt: active.createdAt, vehicle: active.vehicle } : null,
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

export async function getRequest(id: string): Promise<RequestDto> {
  const request = await prisma.request.findUnique({ where: { id }, include: requestInclude });
  if (!request) {
    throw new NotFoundError('Request not found');
  }
  return toRequestDto(request);
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
