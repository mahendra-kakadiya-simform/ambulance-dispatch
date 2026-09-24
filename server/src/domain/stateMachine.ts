// The request lifecycle as data. Pure: no Prisma, no Express — the only import is the
// error type it throws.

import { InvalidTransitionError } from '../utils/errors.js';

export type RequestState = 'REQUESTED' | 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'CANCELLED';

// Every allowed move, keyed by the state it starts from. Anything not listed is rejected.
const FORWARD: Readonly<Record<RequestState, readonly RequestState[]>> = {
  REQUESTED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ARRIVED'],
  ARRIVED: [],
  CANCELLED: [],
};

// Corrections that step back one state. Allowed only with a non-empty reason.
const BACKWARD: Readonly<Record<RequestState, readonly RequestState[]>> = {
  REQUESTED: [],
  ASSIGNED: [],
  EN_ROUTE: ['ASSIGNED'],
  ARRIVED: ['EN_ROUTE'],
  CANCELLED: [],
};

export function isBackward(from: RequestState, to: RequestState): boolean {
  return BACKWARD[from].includes(to);
}

/** True if `from -> to` appears in the map at all (a backward move still needs a reason). */
export function canTransition(from: RequestState, to: RequestState): boolean {
  return FORWARD[from].includes(to) || isBackward(from, to);
}

/** The states reachable from `from`, split by whether a reason is required. */
export function nextStates(from: RequestState): { forward: readonly RequestState[]; backward: readonly RequestState[] } {
  return { forward: FORWARD[from], backward: BACKWARD[from] };
}

/** Throws InvalidTransitionError unless `from -> to` is allowed with the given reason. */
export function assertTransition(from: RequestState, to: RequestState, reason?: string | null): void {
  if (!canTransition(from, to)) {
    const allowed = [...FORWARD[from], ...BACKWARD[from]];
    throw new InvalidTransitionError(
      `Cannot move a request from ${from} to ${to}` +
        (allowed.length > 0 ? `; from ${from} it can only move to ${allowed.join(' or ')}` : `; ${from} is final`),
      { from, to },
    );
  }
  if (isBackward(from, to) && !reason?.trim()) {
    throw new InvalidTransitionError(`Moving a request back from ${from} to ${to} requires a reason`, {
      reason: ['A reason is required to move a request backwards'],
    });
  }
}
