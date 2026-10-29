import type { RunEventBus } from '../adapters/run-event-bus.ts';
import { IDLE_BACKSTOP_MS } from '../constants.ts';
import type { RunEventStore } from '../ports/run-event-store.ts';
import type { RunLifecycleStore } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
export interface RunEventFeed {
  subscribe(runId: string, fromSeq: number): AsyncIterable<SessionEvent>;
  publish(runId: string, events: SessionEvent[]): void;
}
function seqOf(event: SessionEvent): number {
  return (
    (
      event as {
        seq?: number;
      }
    ).seq ?? 0
  );
}
function isBoundary(event: SessionEvent): boolean {
  return (
    event.type === 'ask' ||
    event.type === 'done' ||
    event.type === 'error' ||
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  );
}
function isClosedStatus(status: string): boolean {
  return (
    status !== 'running' && status !== 'queued' && status !== 'waiting' && status !== 'needs_input'
  );
}
export interface RunEventFeedDeps {
  events: Pick<RunEventStore, 'tail'>;
  lifecycle: Pick<RunLifecycleStore, 'get'>;
  bus: RunEventBus;
  idleMs?: number;
}
export function createRunEventFeed(deps: RunEventFeedDeps): RunEventFeed {
  const idleMs = deps.idleMs ?? IDLE_BACKSTOP_MS;
  return {
    publish(runId, events) {
      deps.bus.publish(runId, events);
    },
    async *subscribe(runId, fromSeq) {
      const live = deps.bus.subscribe(runId);
      const it = live[Symbol.asyncIterator]();
      try {
        const missed = await deps.events.tail(runId, fromSeq);
        let lastSeq = fromSeq;
        for (const ev of missed) {
          lastSeq = Math.max(lastSeq, seqOf(ev));
          yield ev;
        }
        let inflight: Promise<IteratorResult<SessionEvent>> | undefined;
        while (true) {
          if (inflight === undefined) {
            inflight = it.next();
          }
          const next = await Promise.race([
            inflight,
            new Promise<null>((r) => setTimeout(() => r(null), idleMs)),
          ]);
          if (!next) {
            const rec = await deps.lifecycle.get(runId);
            if (rec && isClosedStatus(rec.status)) {
              return;
            }
            continue;
          }
          inflight = undefined;
          if (next.done) {
            return;
          }
          const batch = Array.isArray(next.value) ? next.value : [next.value];
          let boundary = false;
          for (const ev of batch) {
            if (seqOf(ev) <= lastSeq) {
              continue;
            }
            lastSeq = seqOf(ev);
            if (isBoundary(ev)) {
              boundary = true;
            }
            yield ev;
          }
          if (boundary) {
            const rec = await deps.lifecycle.get(runId);
            if (rec && isClosedStatus(rec.status)) {
              return;
            }
          }
        }
      } finally {
        it.return?.(undefined);
      }
    },
  };
}
