import { describe, expect, test } from 'bun:test';
import { APICallError } from 'ai';
import { driverErrorStatus, retryPlan } from './ai-llm-retry.ts';

function apiError(status: number, message: string, headers?: Record<string, string>): unknown {
  return new APICallError({
    message,
    url: 'http://127.0.0.1:9/v1/chat',
    requestBodyValues: {},
    statusCode: status,
    ...(headers ? { responseHeaders: headers } : {}),
    isRetryable: status === 429 || status >= 500,
  });
}

describe('retryPlan', () => {
  test('gives rate limits six attempts with capped exponential delays', () => {
    const plan = retryPlan(apiError(429, 'rate limited'), false, undefined, 0);
    expect(plan).toBeDefined();
    expect(plan?.schedule).toHaveLength(6);
    expect(plan?.schedule[5]).toBe(300_000);
    expect(plan?.waitMs).toBeGreaterThan(0);
  });

  test('gives server errors six attempts capped at 60s', () => {
    const plan = retryPlan(apiError(503, 'unavailable'), false, undefined, 5);
    expect(plan?.schedule).toHaveLength(6);
    expect(plan?.schedule[5]).toBe(60_000);
  });

  test('jitters the wait within ±20%', () => {
    for (let i = 0; i < 20; i++) {
      const plan = retryPlan(apiError(503, 'unavailable'), false, undefined, 2);
      expect(plan?.waitMs).toBeGreaterThanOrEqual(8_000 * 0.8);
      expect(plan?.waitMs).toBeLessThanOrEqual(8_000 * 1.2);
    }
  });

  test('clamps Retry-After advice to ten minutes', () => {
    const plan = retryPlan(
      apiError(429, 'rate limited', { 'retry-after': '3600' }),
      false,
      undefined,
      0,
    );
    expect(plan?.waitMs).toBeLessThanOrEqual(600_000 * 1.2);
    expect(plan?.waitMs).toBeGreaterThanOrEqual(600_000 * 0.8);
  });

  test('allows exactly one clean replay after emission started', () => {
    const err = apiError(502, 'bad gateway');
    const first = retryPlan(err, true, undefined, 0);
    expect(first?.replay).toBe(true);
    const second = retryPlan(err, true, undefined, 1, { alreadyReplayed: true });
    expect(second).toBeUndefined();
  });

  test('never retries when the signal is aborted', () => {
    const controller = new AbortController();
    controller.abort();
    expect(retryPlan(apiError(503, 'x'), false, controller.signal, 0)).toBeUndefined();
  });

  test('rejects non-transient errors', () => {
    expect(retryPlan(apiError(400, 'bad request'), false, undefined, 0)).toBeUndefined();
    expect(retryPlan(new Error('plain'), false, undefined, 0)).toBeUndefined();
  });

  test('honors a custom attempt limit', () => {
    const err = apiError(503, 'unavailable');
    expect(retryPlan(err, false, undefined, 1, { attemptLimit: 2 })).toBeDefined();
    expect(retryPlan(err, false, undefined, 2, { attemptLimit: 2 })).toBeUndefined();
    expect(retryPlan(err, false, undefined, 5, { attemptLimit: 1 })).toBeUndefined();
    expect(retryPlan(err, false, undefined, 5)).toBeDefined();
  });
});

describe('driverErrorStatus', () => {
  test('reads plain statusCode from synthetic errors', () => {
    const err = Object.assign(new Error('stream idle'), { statusCode: 504 });
    expect(driverErrorStatus(err)).toBe(504);
  });

  test('reads status through wrapped causes', () => {
    const err = new Error('wrapped', { cause: apiError(429, 'rate limited') });
    expect(driverErrorStatus(err)).toBe(429);
  });
});
