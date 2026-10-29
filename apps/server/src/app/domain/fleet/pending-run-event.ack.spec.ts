import { describe, expect, test } from 'bun:test';
import { mergePendingEvent, remainingAfterAck } from './pending-run-event.ack.ts';
import type { PendingRunEvent } from './pending-run-event.port.ts';

function event(seq: number): PendingRunEvent {
  return {
    runId: 'run-1',
    leaseEpoch: 1,
    seq,
    payloadJson: `{"seq":${seq}}`,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('pending run event ack', () => {
  test('ACK removes seq <= lastSeq for same run/lease', () => {
    const pending = [event(1), event(2), event(3)];
    const left = remainingAfterAck(pending, 'run-1', 1, 2);
    expect(left.map((row) => row.seq)).toEqual([3]);
  });

  test('duplicate seq insert is idempotent', () => {
    const first = mergePendingEvent([], event(1));
    expect(first.inserted).toBe(true);
    const second = mergePendingEvent(first.events, event(1));
    expect(second.inserted).toBe(false);
    expect(second.events).toHaveLength(1);
  });
});
