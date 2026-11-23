import type { SessionEvent } from '@harnesys/studio-shared';
import { LIVE_TAIL_ANCHORS } from '@/shared/config/constants';
import { isToolInputStream, mergeDeltaContinuation, mergeIncomingEvent } from './coalesce-events';
import { eventKey, hasClientEventId, stableEventKey } from './event-keys';
import type { FeedDecision } from './feed/feed-types';
import { TERMINAL_EVENT_TYPES } from './session-types';
export interface ThreadLog {
  events: SessionEvent[];
  seenAt: Record<string, number>;
  seqCeil: Record<string, number>;
  tailCap?: number;
}
export type ApplyIncomingResult = ThreadLog & {
  accepted: number;
  immediateEpoch: boolean;
  trimmed: boolean;
};
interface TrimmedTail {
  events: SessionEvent[];
  removed: SessionEvent[];
}
const TAIL_ANCHOR_TYPES = new Set([
  ...TERMINAL_EVENT_TYPES,
  'ask',
  'wait.started',
  'hitl.answer',
  'wait.resumed',
]);
function isCoalescedStream(event: SessionEvent): boolean {
  return (
    event.type === 'text-delta' || event.type === 'reasoning-delta' || isToolInputStream(event)
  );
}
function trimTail(events: SessionEvent[], max: number): TrimmedTail {
  const start = events.length - max;
  const keep = new Set<number>();
  for (let index = start; index < events.length; index += 1) {
    keep.add(index);
  }
  let anchors = 0;
  for (let index = start - 1; index >= 0 && anchors < LIVE_TAIL_ANCHORS; index -= 1) {
    const event = events[index];
    if (event === undefined || !TAIL_ANCHOR_TYPES.has(event.type)) {
      continue;
    }
    keep.add(index);
    anchors += 1;
  }
  return {
    events: events.filter((_, index) => keep.has(index)),
    removed: events.filter((_, index) => !keep.has(index)),
  };
}

function capTail(
  events: SessionEvent[],
  seenAt: Record<string, number>,
  tailCap: number | undefined,
): TrimmedTail & { seenAt: Record<string, number> } {
  if (tailCap === undefined || events.length <= tailCap) {
    return { events, removed: [], seenAt };
  }
  const trimmed = trimTail(events, tailCap);
  let pruned = seenAt;
  for (const event of trimmed.removed) {
    const key = stableEventKey(event);
    if (key === undefined || pruned[key] === undefined) {
      continue;
    }
    if (pruned === seenAt) {
      pruned = { ...seenAt };
    }
    delete pruned[key];
  }
  return { ...trimmed, seenAt: pruned };
}
export function applyIncomingEvents(
  current: ThreadLog,
  incoming: SessionEvent[],
  now: number,
  sink?: FeedDecision[],
): ApplyIncomingResult {
  let events = current.events;
  let eventsCopy: SessionEvent[] | undefined;
  let seqCeil = current.seqCeil;
  let seqCopy: Record<string, number> | undefined;
  let seenAt = current.seenAt;
  let seenCopy: Record<string, number> | undefined;
  let accepted = 0;
  let immediateEpoch = false;
  const workingEvents = (): SessionEvent[] => {
    if (eventsCopy === undefined) {
      eventsCopy = current.events.slice();
      events = eventsCopy;
    }
    return eventsCopy;
  };
  for (const event of incoming) {
    if (
      event.runId !== undefined &&
      event.seq !== undefined &&
      event.seq <= (seqCeil[event.runId] ?? 0)
    ) {
      continue;
    }
    if (event.runId !== undefined && event.seq !== undefined) {
      if (seqCopy === undefined) {
        seqCopy = { ...current.seqCeil };
        seqCeil = seqCopy;
      }
      seqCeil[event.runId] = event.seq;
    }
    accepted += 1;
    if (isCoalescedStream(event)) {
      const list = workingEvents();
      const tail = list[list.length - 1];
      if (tail !== undefined) {
        const merged = mergeDeltaContinuation(tail, event);
        if (merged !== null) {
          list[list.length - 1] = merged;
          sink?.push({ ev: event, merged: true, index: list.length - 1 });
          continue;
        }
      }
      list.push(event);
      sink?.push({ ev: event, merged: false, index: list.length - 1 });
      immediateEpoch = true;
      rememberSeen(event, now, () => {
        if (seenCopy === undefined) {
          seenCopy = { ...current.seenAt };
          seenAt = seenCopy;
        }
        return seenCopy;
      });
      continue;
    }
    const list = workingEvents();
    // A runId:seq duplicate would have been dropped by the seqCeil gate above and
    // an event without a stable key can never match an existing row, so only
    // clientEventId-keyed events need the dedupe scan.
    const key = eventKey(event);
    const index = hasClientEventId(event) ? list.findIndex((ev) => eventKey(ev) === key) : -1;
    if (index === -1) {
      list.push(event);
      sink?.push({ ev: event, merged: false, index: list.length - 1 });
    } else {
      list[index] = mergeIncomingEvent(list[index], event);
      sink?.push({ ev: event, merged: true, index, replaces: true });
    }
    immediateEpoch = true;
    rememberSeen(event, now, () => {
      if (seenCopy === undefined) {
        seenCopy = { ...current.seenAt };
        seenAt = seenCopy;
      }
      return seenCopy;
    });
  }
  const capped = capTail(events, seenAt, current.tailCap);
  return {
    events: capped.events,
    seenAt: capped.seenAt,
    seqCeil,
    accepted,
    immediateEpoch,
    trimmed: capped.events !== events,
  };
}
function rememberSeen(event: SessionEvent, now: number, copy: () => Record<string, number>): void {
  const key = stableEventKey(event);
  if (key === undefined) {
    return;
  }
  const seen = copy();
  if (seen[key] === undefined) {
    seen[key] = now;
  }
}
