import { RequestState } from '../types';

// Mirrors server/src/domain/stateMachine.ts. It is used ONLY to decide which buttons to
// render. The server re-checks every transition, so this is convenience, not enforcement.

export interface TransitionOption {
  to: RequestState;
  label: string;
  // Backward corrections need a reason; the server rejects them without one.
  needsReason: boolean;
}

// What a driver may do from each state. Assigning (via the assign action) and
// cancelling are dispatch-only, so they never appear here.
export const DRIVER_TRANSITIONS: Record<RequestState, TransitionOption[]> = {
  [RequestState.REQUESTED]: [],
  [RequestState.ASSIGNED]: [{ to: RequestState.EN_ROUTE, label: 'Start — en route', needsReason: false }],
  [RequestState.EN_ROUTE]: [
    { to: RequestState.ARRIVED, label: 'Arrived at patient', needsReason: false },
    { to: RequestState.ASSIGNED, label: 'Back to assigned', needsReason: true },
  ],
  [RequestState.ARRIVED]: [{ to: RequestState.EN_ROUTE, label: 'Reopen — back en route', needsReason: true }],
  [RequestState.CANCELLED]: [],
};

// The happy path shown by the driver's stepper (CANCELLED is off the path).
export const LIFECYCLE_STEPS: RequestState[] = [
  RequestState.REQUESTED,
  RequestState.ASSIGNED,
  RequestState.EN_ROUTE,
  RequestState.ARRIVED,
];
