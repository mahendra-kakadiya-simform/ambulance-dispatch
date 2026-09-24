import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, isBackward } from '../../domain/stateMachine.js';
import { InvalidTransitionError } from '../../utils/errors.js';

describe('request state machine', () => {
  it('allows a valid forward transition (ASSIGNED -> EN_ROUTE)', () => {
    expect(canTransition('ASSIGNED', 'EN_ROUTE')).toBe(true);
    expect(isBackward('ASSIGNED', 'EN_ROUTE')).toBe(false);
    expect(() => assertTransition('ASSIGNED', 'EN_ROUTE')).not.toThrow();
  });

  it('rejects skipping a state (REQUESTED -> ARRIVED)', () => {
    expect(canTransition('REQUESTED', 'ARRIVED')).toBe(false);
    expect(() => assertTransition('REQUESTED', 'ARRIVED')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('REQUESTED', 'ARRIVED')).toThrow(/Cannot move a request from REQUESTED to ARRIVED/);
  });

  it('rejects a backward transition with no reason (EN_ROUTE -> ASSIGNED)', () => {
    expect(isBackward('EN_ROUTE', 'ASSIGNED')).toBe(true);
    expect(() => assertTransition('EN_ROUTE', 'ASSIGNED')).toThrow(/requires a reason/);
    expect(() => assertTransition('EN_ROUTE', 'ASSIGNED', '   ')).toThrow(InvalidTransitionError);
  });

  it('allows a backward transition with a reason (ARRIVED -> EN_ROUTE)', () => {
    expect(() => assertTransition('ARRIVED', 'EN_ROUTE', 'Wrong address, patient not here')).not.toThrow();
  });

  it('treats CANCELLED and ARRIVED as final for forward moves', () => {
    expect(() => assertTransition('CANCELLED', 'REQUESTED')).toThrow(/CANCELLED is final/);
    expect(canTransition('ARRIVED', 'CANCELLED')).toBe(false);
  });

  it('only allows cancelling before the vehicle is en route', () => {
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('ASSIGNED', 'CANCELLED')).toBe(true);
    expect(canTransition('EN_ROUTE', 'CANCELLED')).toBe(false);
  });
});
