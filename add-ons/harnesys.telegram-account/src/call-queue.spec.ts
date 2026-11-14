import { describe, expect, test } from 'bun:test';
import { createCallQueue } from './call-queue.ts';

describe('tool call queue', () => {
  test('runs queued calls one at a time', async () => {
    const queue = createCallQueue();
    const events: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue.run(async () => {
      events.push('first:start');
      await gate;
      events.push('first:end');
      return 'first';
    });
    const second = queue.run(async () => {
      events.push('second');
      return 'second';
    });
    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    release();
    expect(await first).toBe('first');
    expect(await second).toBe('second');
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  test('keeps running the next call after a failed one', async () => {
    const queue = createCallQueue();
    const failed = queue.run(async () => {
      throw new Error('boom');
    });
    const next = queue.run(async () => 'next');
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('next');
  });
});
