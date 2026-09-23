import { describe, expect, it } from 'vitest';
import { explainPick, pickVehicle, rankCandidates, type RuleRequest, type RuleVehicle } from '../../domain/assignmentRule.js';

// Coordinates are the seeded Ahmedabad demo data (prisma/seed.ts).
const AMB_01: RuleVehicle = { id: 'v1', code: 'AMB-01', latitude: 23.0225, longitude: 72.5714 };
const AMB_03: RuleVehicle = { id: 'v3', code: 'AMB-03', latitude: 22.9925, longitude: 72.6014 };
// AMB-02 (23.0676, 72.5714) is OUT_OF_SERVICE in the seed, so it never reaches the rule —
// the service only passes AVAILABLE vehicles.

const ROUTINE_2KM: RuleRequest = { id: 'r-routine', urgency: 'ROUTINE', latitude: 23.0225, longitude: 72.591 };
const CRITICAL_8KM: RuleRequest = { id: 'r-critical', urgency: 'CRITICAL', latitude: 23.0946, longitude: 72.5714 };

describe('assignment rule: urgency before proximity', () => {
  describe('among requests of equal urgency', () => {
    it('the nearest available vehicle wins', () => {
      const near: RuleVehicle = { id: 'near', code: 'NEAR', latitude: 23.03, longitude: 72.57 };
      const far: RuleVehicle = { id: 'far', code: 'FAR', latitude: 23.2, longitude: 72.7 };
      const request: RuleRequest = { id: 'r', urgency: 'URGENT', latitude: 23.02, longitude: 72.57 };

      expect(pickVehicle(request, [far, near])?.vehicle.code).toBe('NEAR');
    });

    it('another waiting request of the same urgency does not hold a vehicle back', () => {
      const other: RuleRequest = { id: 'other', urgency: 'ROUTINE', latitude: 23.0225, longitude: 72.5714 };

      expect(pickVehicle(ROUTINE_2KM, [AMB_01, AMB_03], [other])?.vehicle.code).toBe('AMB-01');
    });
  });

  describe('the spec scenario: CRITICAL 8 km from AMB-01, ROUTINE 2 km from AMB-01', () => {
    it('sets up the distances the scenario describes', () => {
      const fromRoutine = rankCandidates(ROUTINE_2KM, [AMB_01, AMB_03]);
      const fromCritical = rankCandidates(CRITICAL_8KM, [AMB_01, AMB_03]);

      expect(fromRoutine[0]?.vehicle.code).toBe('AMB-01');
      expect(fromRoutine[0]?.distanceKm).toBeCloseTo(2, 0);
      expect(fromCritical[0]?.vehicle.code).toBe('AMB-01');
      expect(fromCritical[0]?.distanceKm).toBeCloseTo(8, 0);
    });

    it('AMB-01 goes to the CRITICAL request', () => {
      expect(pickVehicle(CRITICAL_8KM, [AMB_01, AMB_03], [ROUTINE_2KM])?.vehicle.code).toBe('AMB-01');
    });

    it('the ROUTINE request takes the further AMB-03, even when it is assigned first', () => {
      const result = explainPick(ROUTINE_2KM, [AMB_01, AMB_03], [CRITICAL_8KM]);

      expect(result.chosen?.vehicle.code).toBe('AMB-03');
      const amb01 = result.candidates.find((c) => c.vehicle.code === 'AMB-01');
      expect(amb01?.chosen).toBe(false);
      expect(amb01?.heldFor?.id).toBe('r-critical');
      expect(result.chosen?.distanceKm).toBeGreaterThan(amb01?.distanceKm ?? Infinity);
    });
  });

  describe('a further vehicle is chosen over a nearer one purely because of urgency', () => {
    const near: RuleVehicle = { id: 'near', code: 'NEAR', latitude: 23.0, longitude: 72.6 };
    const far: RuleVehicle = { id: 'far', code: 'FAR', latitude: 23.1, longitude: 72.7 };
    const routine: RuleRequest = { id: 'routine', urgency: 'ROUTINE', latitude: 23.0, longitude: 72.6 };
    const urgent: RuleRequest = { id: 'urgent', urgency: 'URGENT', latitude: 23.01, longitude: 72.61 };

    it('without a more urgent request waiting, the nearer vehicle is chosen', () => {
      expect(pickVehicle(routine, [near, far], [])?.vehicle.code).toBe('NEAR');
    });

    it('with a more urgent request waiting, the same request gets the further vehicle', () => {
      expect(pickVehicle(routine, [near, far], [urgent])?.vehicle.code).toBe('FAR');
    });

    it('a less urgent waiting request never holds a vehicle back from a more urgent one', () => {
      expect(pickVehicle(urgent, [near, far], [routine])?.vehicle.code).toBe('NEAR');
    });
  });

  describe('when nothing is available', () => {
    it('no available vehicles returns null rather than throwing', () => {
      expect(pickVehicle(ROUTINE_2KM, [])).toBeNull();
      expect(explainPick(ROUTINE_2KM, []).candidates).toEqual([]);
    });

    it('every vehicle held for more urgent requests also returns null', () => {
      expect(pickVehicle(ROUTINE_2KM, [AMB_01], [CRITICAL_8KM])).toBeNull();
    });
  });
});
