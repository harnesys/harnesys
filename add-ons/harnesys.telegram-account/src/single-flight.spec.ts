import { describe, expect, test } from 'bun:test';
import { createSingleFlight } from './single-flight.ts';

describe('single flight', () => {
  test('coalesces concurrent calls into one run and resolves both callers', async () => {
    let runs = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = createSingleFlight(async (value: string) => {
      runs += 1;
      await gate;
      return value;
    });
    const first = run('first');
    const second = run('second');
    expect(runs).toBe(1);
    release();
    expect(await first).toBe('first');
    expect(await second).toBe('first');
    expect(runs).toBe(1);
  });

  test('starts a new run after the previous one settles, including a failure', async () => {
    let runs = 0;
    const run = createSingleFlight(async () => {
      runs += 1;
      if (runs === 1) {
        throw new Error('boom');
      }
      return runs;
    });
    await expect(run()).rejects.toThrow('boom');
    await expect(run()).resolves.toBe(2);
    expect(runs).toBe(2);
  });
});
