import { describe, expect, it } from 'vitest';
import { canArmSpeedLadder, isNaturalLoopBoundary, nextSupportedSpeed } from './speedLadder';

describe('speed ladder rules', () => {
  it('advances by one supported speed step without exceeding the target', () => {
    expect(nextSupportedSpeed(0.5, 1, [1.25, 0.5, 1, 0.75])).toBe(0.75);
    expect(nextSupportedSpeed(0.75, 1, [1.25, 0.5, 1, 0.75])).toBe(1);
  });

  it('stops when the current rate has reached the target', () => {
    expect(nextSupportedSpeed(1, 1, [0.5, 0.75, 1, 1.25])).toBeNull();
  });

  it('recognizes a B crossing reached by plausible playback between polls', () => {
    expect(isNaturalLoopBoundary(19.8, 20.05, 20, 200, 1.25)).toBe(true);
    expect(isNaturalLoopBoundary(0, 20, 20, 80, 1)).toBe(false);
    expect(isNaturalLoopBoundary(19.8, 20.05, 20, 900, 1.25)).toBe(false);
  });

  it('does not mistake a short seek near B for a completed pass', () => {
    expect(isNaturalLoopBoundary(19.8, 20, 20, 80, 1.25)).toBe(false);
  });

  it('accepts a near-B transition indistinguishable from natural playback at the poll rate', () => {
    expect(isNaturalLoopBoundary(19.9, 20, 20, 80, 1.25)).toBe(true);
  });

  it('rejects a target that is unavailable or not above the current rate', () => {
    const rates = [0.5, 0.75, 1, 1.25];
    expect(nextSupportedSpeed(0.5, 1.1, rates)).toBeNull();
    expect(nextSupportedSpeed(1, 0.75, rates)).toBeNull();
    expect(nextSupportedSpeed(0.5, 0.5, rates)).toBeNull();
  });

  it('arms only for a supported higher target and a valid in-range loop', () => {
    const rates = [0.5, 0.75, 1, 1.25];
    expect(canArmSpeedLadder({ currentRate: 0.5, targetRate: 1, availableRates: rates, duration: 180, loopA: 0, loopB: 12 })).toBe(true);
    expect(canArmSpeedLadder({ currentRate: 0.5, targetRate: 1.1, availableRates: rates, duration: 180, loopA: 0, loopB: 12 })).toBe(false);
  });

  it.each([
    { loopA: null, loopB: 12, duration: 180 },
    { loopA: 12, loopB: null, duration: 180 },
    { loopA: 12, loopB: 12, duration: 180 },
    { loopA: 13, loopB: 12, duration: 180 },
    { loopA: 0, loopB: 181, duration: 180 },
    { loopA: 0, loopB: 12, duration: 0 },
    { loopA: 0, loopB: 12, duration: Number.NaN },
  ])('refuses invalid loop bounds: $loopA–$loopB in $duration seconds', ({ loopA, loopB, duration }) => {
    expect(canArmSpeedLadder({ currentRate: 0.5, targetRate: 1, availableRates: [0.5, 0.75, 1], duration, loopA, loopB })).toBe(false);
  });
});
