import type { PendingRunEvent } from './pending-run-event.port.ts';

export function remainingAfterAck(
  events: PendingRunEvent[],
  runId: string,
  leaseEpoch: number,
  lastSeq: number,
): PendingRunEvent[] {
  return events.filter(
    (event) => !(event.runId === runId && event.leaseEpoch === leaseEpoch && event.seq <= lastSeq),
  );
}

export function mergePendingEvent(
  events: PendingRunEvent[],
  next: PendingRunEvent,
): { events: PendingRunEvent[]; inserted: boolean } {
  const exists = events.some(
    (event) =>
      event.runId === next.runId && event.leaseEpoch === next.leaseEpoch && event.seq === next.seq,
  );
  if (exists) {
    return { events, inserted: false };
  }
  return {
    events: [...events, next].sort((a, b) => a.seq - b.seq),
    inserted: true,
  };
}
