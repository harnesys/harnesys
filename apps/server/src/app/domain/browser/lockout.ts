export const LOCKOUT_FAILURE_CAP = 3;
export const LOCKOUT_BASE_MS = 60_000;
export const LOCKOUT_MAX_MS = 15 * 60_000;

export interface LockoutState {
  failureCount: number;
  lockedUntil: string | null;
}

export function nextLockoutState(failureCount: number, now: number): LockoutState {
  const next = failureCount + 1;
  if (next < LOCKOUT_FAILURE_CAP) {
    return { failureCount: next, lockedUntil: null };
  }
  const delay = Math.min(LOCKOUT_BASE_MS * 2 ** (next - LOCKOUT_FAILURE_CAP), LOCKOUT_MAX_MS);
  return { failureCount: next, lockedUntil: new Date(now + delay).toISOString() };
}

export function isLockedOut(state: { lockedUntil: string | null }, now: number): boolean {
  if (state.lockedUntil === null) {
    return false;
  }
  const until = Date.parse(state.lockedUntil);
  return Number.isFinite(until) && until > now;
}
