import { describe, expect, test } from 'bun:test';
import { abortableSleep } from './ai-llm-adapter.ts';

describe('abortableSleep', () => {
  test('resolves after delay without signal', async () => {
    const start = Date.now();
    await abortableSleep(30, undefined);
    expect(Date.now() - start).toBeGreaterThanOrEqual(20);
  });

  test('resolves immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await abortableSleep(60_000, controller.signal);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('wakes early on abort during sleep', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    const start = Date.now();
    await abortableSleep(60_000, controller.signal);
    expect(Date.now() - start).toBeLessThan(5000);
  });
});
