import { describe, expect, test } from 'bun:test';
import {
  isLockedOut,
  LOCKOUT_BASE_MS,
  LOCKOUT_FAILURE_CAP,
  LOCKOUT_MAX_MS,
  nextLockoutState,
} from './lockout.ts';

describe('nextLockoutState', () => {
  test('first failures do not lock', () => {
    const first = nextLockoutState(0, 1_000);
    expect(first.failureCount).toBe(1);
    expect(first.lockedUntil).toBeNull();
    const second = nextLockoutState(first.failureCount, 1_000);
    expect(second.failureCount).toBe(2);
    expect(second.lockedUntil).toBeNull();
  });

  test('cap-th failure locks with base delay', () => {
    const now = 5_000;
    const third = nextLockoutState(2, now);
    expect(third.failureCount).toBe(LOCKOUT_FAILURE_CAP);
    expect(third.lockedUntil).toBe(new Date(now + LOCKOUT_BASE_MS).toISOString());
  });

  test('backoff grows exponentially after the cap', () => {
    const now = 5_000;
    const fourth = nextLockoutState(3, now);
    expect(fourth.lockedUntil).toBe(new Date(now + 2 * LOCKOUT_BASE_MS).toISOString());
    const fifth = nextLockoutState(4, now);
    expect(fifth.lockedUntil).toBe(new Date(now + 4 * LOCKOUT_BASE_MS).toISOString());
  });

  test('backoff is capped at the maximum delay', () => {
    const now = 0;
    const state = nextLockoutState(50, now);
    expect(state.lockedUntil).toBe(new Date(now + LOCKOUT_MAX_MS).toISOString());
  });
});

describe('isLockedOut', () => {
  test('open lock expires', () => {
    const state = nextLockoutState(2, 1_000_000);
    const until = Date.parse(state.lockedUntil ?? '');
    expect(isLockedOut(state, until - 1)).toBe(true);
    expect(isLockedOut(state, until)).toBe(false);
  });

  test('null lock never locks', () => {
    expect(isLockedOut({ lockedUntil: null }, Date.now())).toBe(false);
  });
});
