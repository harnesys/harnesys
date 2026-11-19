import { describe, expect, test } from 'bun:test';
import {
  admitQuota,
  bucketWindowStartMs,
  emptyQuotaState,
  type QuotaState,
  settleQuota,
} from './model-quota.ts';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 86_400_000;

function noonState(): { state: QuotaState; nowMs: number } {
  return { state: emptyQuotaState(), nowMs: Date.now() };
}

describe('bucketWindowStartMs', () => {
  test('floors minute buckets', () => {
    const now = Date.now();
    const start = bucketWindowStartMs('rpm', now);
    expect(now - start).toBeLessThan(MINUTE_MS);
    expect(start % MINUTE_MS).toBe(0);
  });

  test('floors day buckets at UTC midnight', () => {
    const start = bucketWindowStartMs('rpd', Date.UTC(2026, 4, 19, 23, 59, 59));
    expect(start).toBe(Date.UTC(2026, 4, 19, 0, 0, 0));
  });
});

describe('admitQuota', () => {
  test('grants under the limit and counts the reservation', () => {
    const { state, nowMs } = noonState();
    const first = admitQuota(
      { state: state, key: 'p:m', limits: { rpm: 2 }, estTokens: 0, reservationId: 'r1' },
      nowMs,
    );
    expect(first.granted).toBe(true);
    const second = admitQuota(
      { state: state, key: 'p:m', limits: { rpm: 2 }, estTokens: 0, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(true);
    const third = admitQuota(
      { state: state, key: 'p:m', limits: { rpm: 2 }, estTokens: 0, reservationId: 'r3' },
      nowMs,
    );
    expect(third.granted).toBe(false);
    expect(third.reason).toBe('rpm');
    expect(third.waitMs).toBeGreaterThan(0);
    expect(third.waitMs).toBeLessThanOrEqual(MINUTE_MS);
  });

  test('token reservation blocks admission until settled', () => {
    const { state, nowMs } = noonState();
    const first = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r1' },
      nowMs,
    );
    expect(first.granted).toBe(true);
    const second = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('tpm');
  });

  test('reconciles reserve into actual usage on settle', () => {
    const { state, nowMs } = noonState();
    const first = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r1' },
      nowMs,
    );
    settleQuota(state, 'p:m', first.reservation ?? '', 3_000, nowMs);
    const second = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 6_000, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(true);
    settleQuota(state, 'p:m', second.reservation ?? '', 6_000, nowMs);
    const third = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r3' },
      nowMs,
    );
    expect(third.granted).toBe(false);
  });

  test('releasing a failed call frees the reserve without counting usage', () => {
    const { state, nowMs } = noonState();
    const first = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r1' },
      nowMs,
    );
    settleQuota(state, 'p:m', first.reservation ?? '', undefined, nowMs);
    const second = admitQuota(
      { state, key: 'p:m', limits: { tpm: 10_000 }, estTokens: 8_000, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(true);
  });

  test('a daily window waits until the next UTC midnight', () => {
    const state = emptyQuotaState();
    const nowMs = Date.UTC(2026, 4, 19, 23, 30, 0);
    const first = admitQuota(
      { state: state, key: 'p:m', limits: { rpd: 1 }, estTokens: 0, reservationId: 'r1' },
      nowMs,
    );
    expect(first.granted).toBe(true);
    const second = admitQuota(
      { state: state, key: 'p:m', limits: { rpd: 1 }, estTokens: 0, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('rpd');
    expect(second.waitMs).toBe(30 * MINUTE_MS);
  });

  test('settle after a window rollover counts usage into the current window', () => {
    const state = emptyQuotaState();
    const beforeMidnight = Date.UTC(2026, 4, 19, 23, 59, 59);
    const first = admitQuota(
      { state, key: 'p:m', limits: { tpd: 10_000 }, estTokens: 9_000, reservationId: 'r1' },
      beforeMidnight,
    );
    expect(first.granted).toBe(true);
    const afterMidnight = beforeMidnight + 2_000;
    settleQuota(state, 'p:m', first.reservation ?? '', 9_000, afterMidnight);
    const second = admitQuota(
      { state, key: 'p:m', limits: { tpd: 10_000 }, estTokens: 9_000, reservationId: 'r2' },
      afterMidnight,
    );
    expect(second.granted).toBe(true);
  });

  test('ignores unset and zero limits', () => {
    const { state, nowMs } = noonState();
    for (let i = 0; i < 50; i++) {
      const admission = admitQuota(
        { state, key: 'p:m', limits: {}, estTokens: 0, reservationId: `r${i}` },
        nowMs,
      );
      expect(admission.granted).toBe(true);
    }
  });

  test('reports the binding bucket when several are violated', () => {
    const state = emptyQuotaState();
    const nowMs = Date.UTC(2026, 4, 19, 10, 0, 0);
    admitQuota(
      { state: state, key: 'p:m', limits: { rpm: 1, rpd: 1 }, estTokens: 0, reservationId: 'r1' },
      nowMs,
    );
    const second = admitQuota(
      { state: state, key: 'p:m', limits: { rpm: 1, rpd: 1 }, estTokens: 0, reservationId: 'r2' },
      nowMs,
    );
    expect(second.granted).toBe(false);
    expect(second.reason).toBe('rpd');
    expect(second.waitMs).toBe(DAY_MS - 10 * HOUR_MS);
  });
});
