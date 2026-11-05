import type { SessionEvent } from '../ports/session.ts';

export type RunEventPublishListener = (
  threadId: string,
  runId: string,
  events: SessionEvent[],
) => void;

export interface RunEventBusOptions {
  onPublish?: RunEventPublishListener;
}

export interface RunEventBus {
  publish(threadId: string, runId: string, events: SessionEvent[]): void;
  subscribe(runId: string): AsyncIterable<SessionEvent>;
}
interface BusSubscriber {
  queue: SessionEvent[];
  wake: (() => void) | null;
}
export function createRunEventBus(options?: RunEventBusOptions): RunEventBus {
  const subscribers = new Map<string, Set<BusSubscriber>>();
  return {
    publish(threadId: string, runId: string, events: SessionEvent[]): void {
      try {
        options?.onPublish?.(threadId, runId, events);
      } catch {
        // live fan-out must not break the run that published the event
      }
      for (const sub of subscribers.get(runId) ?? []) {
        sub.queue.push(...events);
        sub.wake?.();
        sub.wake = null;
      }
    },
    subscribe(runId: string): AsyncIterable<SessionEvent> {
      const live = subscribers.get(runId) ?? new Set<BusSubscriber>();
      subscribers.set(runId, live);
      const self: BusSubscriber = { queue: [], wake: null };
      live.add(self);
      return {
        async *[Symbol.asyncIterator]() {
          try {
            let index = 0;
            while (true) {
              for (; index < self.queue.length; index += 1) {
                yield self.queue[index] as SessionEvent;
              }
              await new Promise<void>((resolve) => {
                if (index < self.queue.length) {
                  resolve();
                } else {
                  self.wake = resolve;
                }
              });
            }
          } finally {
            live.delete(self);
          }
        },
      };
    },
  };
}
