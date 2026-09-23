// The rule: urgency before proximity — a request gets the nearest available vehicle that
// is not the nearest available vehicle of any waiting request with higher urgency.
//
// Pure functions over plain objects: no Prisma, no Express, no I/O. The service layer
// loads the data, calls pickVehicle/explainPick, and persists the result.

import { haversineKm, type LatLng } from './distance.js';

export type Urgency = 'CRITICAL' | 'URGENT' | 'ROUTINE';

// Lower rank = served first. This is data, not a chain of ifs: the comparison below reads
// ranks from PRIORITY_KEYS, so a tiebreaker is one more entry there, not a code change.
export const URGENCY_RANK: Readonly<Record<Urgency, number>> = Object.freeze({
  CRITICAL: 0,
  URGENT: 1,
  ROUTINE: 2,
});

export interface RuleRequest extends LatLng {
  id: string;
  urgency: Urgency;
}

export interface RuleVehicle extends LatLng {
  id: string;
  code: string;
}

export interface RankedCandidate<V extends RuleVehicle = RuleVehicle> {
  vehicle: V;
  distanceKm: number;
}

// Each key maps a request to a number; requests are compared key by key, lower first.
// Only urgency today. Adding e.g. `(r) => r.createdAt.getTime()` would make older
// requests of the same urgency outrank newer ones, with no change to `outranks`.
const PRIORITY_KEYS: ReadonlyArray<(request: RuleRequest) => number> = [(request) => URGENCY_RANK[request.urgency]];

function comparePriority(a: RuleRequest, b: RuleRequest): number {
  for (const key of PRIORITY_KEYS) {
    const diff = key(a) - key(b);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** True when `a` must be served before `b`. Equal priority is not outranking. */
function outranks(a: RuleRequest, b: RuleRequest): boolean {
  return comparePriority(a, b) < 0;
}

/** Vehicles sorted nearest-first relative to the request, each with its distance. */
export function rankCandidates<V extends RuleVehicle>(request: RuleRequest, availableVehicles: readonly V[]): RankedCandidate<V>[] {
  return availableVehicles
    .map((vehicle) => ({ vehicle, distanceKm: haversineKm(request, vehicle) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.vehicle.code.localeCompare(b.vehicle.code));
}

export interface ExplainedCandidate<V extends RuleVehicle = RuleVehicle> extends RankedCandidate<V> {
  chosen: boolean;
  /** Set when this vehicle was passed over because a more urgent waiting request claims it. */
  heldFor: RuleRequest | null;
}

export interface PickExplanation<V extends RuleVehicle = RuleVehicle> {
  chosen: RankedCandidate<V> | null;
  /** Every available vehicle, nearest first, with why it was or wasn't chosen. */
  candidates: ExplainedCandidate<V>[];
}

/**
 * Applies the rule and returns the full reasoning. `waitingRequests` are the other
 * unassigned requests competing for the same vehicles; only those with strictly higher
 * priority affect the outcome. They claim vehicles in priority order, each taking its
 * nearest still-unclaimed vehicle, and the target request then takes its nearest
 * remaining one.
 */
export function explainPick<V extends RuleVehicle>(
  request: RuleRequest,
  availableVehicles: readonly V[],
  waitingRequests: readonly RuleRequest[] = [],
): PickExplanation<V> {
  const ahead = waitingRequests
    .filter((other) => other.id !== request.id && outranks(other, request))
    .sort(comparePriority);

  const heldFor = new Map<string, RuleRequest>();
  for (const other of ahead) {
    const nearestFree = rankCandidates(other, availableVehicles).find((c) => !heldFor.has(c.vehicle.id));
    if (nearestFree) {
      heldFor.set(nearestFree.vehicle.id, other);
    }
  }

  const ranked = rankCandidates(request, availableVehicles);
  const chosen = ranked.find((c) => !heldFor.has(c.vehicle.id)) ?? null;

  return {
    chosen,
    candidates: ranked.map((c) => ({
      ...c,
      chosen: c.vehicle.id === chosen?.vehicle.id,
      heldFor: heldFor.get(c.vehicle.id) ?? null,
    })),
  };
}

/** The best vehicle for `request` under the rule, or null when none is free for it. */
export function pickVehicle<V extends RuleVehicle>(
  request: RuleRequest,
  availableVehicles: readonly V[],
  waitingRequests: readonly RuleRequest[] = [],
): RankedCandidate<V> | null {
  return explainPick(request, availableVehicles, waitingRequests).chosen;
}
