import { describe, expect, test } from 'bun:test';
import { EchoBarrier } from './project-connector-echo.ts';

describe('EchoBarrier', () => {
  test('runs echoes in order and waits for the last one', async () => {
    const barrier = new EchoBarrier();
    const done: string[] = [];
    let releaseFirst = () => {};
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    barrier.enqueue('org:thread', async () => {
      await first;
      done.push('first');
    });
    barrier.enqueue('org:thread', async () => {
      done.push('second');
    });

    const waited = barrier.wait('org:thread');
    releaseFirst();
    await waited;

    expect(done).toEqual(['first', 'second']);
  });

  test('does not block a thread without a queued echo', async () => {
    const barrier = new EchoBarrier();
    await barrier.wait('org:other');
    expect(true).toBe(true);
  });
});
