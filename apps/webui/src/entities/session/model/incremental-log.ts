import type { SessionEvent } from '@harnesys/studio-shared';
import type { ThreadSeqBounds } from './apply-deletions';
import { mergeDeltaContinuation } from './coalesce-events';
import { fillSeenAt, stableKeys } from './event-keys';
import { feedHasFold, feedUpdate } from './feed/feed-engine';
import type { FeedDecision } from './feed/feed-types';
import { streamSlotOf } from './reconcile-snapshot';
import { EMPTY_EVENTS, type SessionStoreState, type ThreadHistoryWindow } from './session-types';

export interface IncrementalLogRequest {
  state: SessionStoreState;
  threadId: string;
  windowOf: (bounds: ThreadSeqBounds) => ThreadHistoryWindow;
}

export interface TailAppendRequest extends IncrementalLogRequest {
  incoming: SessionEvent[];
  keepLocalBelow: number;
  rejectDuplicateSeq?: boolean;
  seqCeil: Record<string, number>;
}

interface Shape {
  minThreadSeq: number;
  maxThreadSeq: number;
  statsCount: number;
  lastStatsIndex: number;
}

interface AppendedTail {
  events: SessionEvent[];
  decisions: FeedDecision[];
  prunedBefore: number;
}

function shapeOf(events: SessionEvent[]): Shape {
  let minThreadSeq = 0;
  let maxThreadSeq = 0;
  let statsCount = 0;
  let lastStatsIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as SessionEvent;
    const seq = event.threadSeq;
    if (seq !== undefined) {
      minThreadSeq = minThreadSeq === 0 ? seq : Math.min(minThreadSeq, seq);
      maxThreadSeq = Math.max(maxThreadSeq, seq);
    }
    if (event.type === 'model.stats') {
      statsCount += 1;
      lastStatsIndex = index;
    }
  }
  return { minThreadSeq, maxThreadSeq, statsCount, lastStatsIndex };
}

function withoutStats(events: SessionEvent[]): SessionEvent[] {
  const kept: SessionEvent[] = [];
  for (const event of events) {
    if (event.type !== 'model.stats') {
      kept.push(event);
    }
  }
  return kept;
}

function localShapeOf(current: SessionEvent[], request: TailAppendRequest): Shape | null {
  let minThreadSeq = 0;
  let maxThreadSeq = 0;
  let statsCount = 0;
  let lastStatsIndex = -1;
  const seqs = request.rejectDuplicateSeq === true ? new Set<number>() : null;
  for (let index = 0; index < current.length; index += 1) {
    const event = current[index] as SessionEvent;
    const seq = event.threadSeq;
    if (seq === undefined) {
      return null;
    }
    if (seq >= request.keepLocalBelow) {
      return null;
    }
    if (seqs !== null) {
      if (seqs.has(seq)) {
        return null;
      }
      seqs.add(seq);
    }
    minThreadSeq = minThreadSeq === 0 ? seq : Math.min(minThreadSeq, seq);
    maxThreadSeq = Math.max(maxThreadSeq, seq);
    if (event.type === 'model.stats') {
      statsCount += 1;
      lastStatsIndex = index;
    }
  }
  return { minThreadSeq, maxThreadSeq, statsCount, lastStatsIndex };
}

function incomingShapeOf(
  incoming: SessionEvent[],
  request: TailAppendRequest,
  floor: number,
): Shape | null {
  const seqs = request.rejectDuplicateSeq === true ? new Set<number>() : null;
  for (const event of incoming) {
    const seq = event.threadSeq;
    if (seq === undefined) {
      continue;
    }
    if (seq <= floor) {
      return null;
    }
    if (seqs !== null) {
      if (seqs.has(seq)) {
        return null;
      }
      seqs.add(seq);
    }
  }
  return shapeOf(incoming);
}

function overlapsStreams(current: SessionEvent[], incoming: SessionEvent[]): boolean {
  const runIds = new Set<string>();
  const identities = new Set<string>();
  for (const event of incoming) {
    const slot = streamSlotOf(event);
    if (slot === null) {
      continue;
    }
    identities.add(slot.identity);
    if (event.runId !== undefined) {
      runIds.add(event.runId);
    }
  }
  if (identities.size === 0) {
    return false;
  }
  for (const event of current) {
    if (event.runId === undefined || !runIds.has(event.runId)) {
      continue;
    }
    const slot = streamSlotOf(event);
    if (slot !== null && identities.has(slot.identity)) {
      return true;
    }
  }
  return false;
}

function reconciledBoundsOf(events: SessionEvent[]): ThreadSeqBounds | null {
  if (events.length === 0) {
    return null;
  }
  let min = 0;
  let max = 0;
  let statsCount = 0;
  let previous: SessionEvent | undefined;
  for (const event of events) {
    const seq = event.threadSeq;
    if (seq === undefined) {
      return null;
    }
    if (previous !== undefined) {
      const previousSeq = previous.threadSeq ?? 0;
      if (previousSeq > seq || mergeDeltaContinuation(previous, event) !== null) {
        return null;
      }
    }
    if (event.type === 'model.stats') {
      statsCount += 1;
      if (statsCount > 1) {
        return null;
      }
    }
    min = min === 0 ? seq : Math.min(min, seq);
    max = Math.max(max, seq);
    previous = event;
  }
  return { min, max };
}

function coalesceIncoming(incoming: SessionEvent[]): SessionEvent[] {
  const slots: SessionEvent[] = [];
  for (const event of incoming) {
    const last = slots[slots.length - 1];
    const merged = last === undefined ? null : mergeDeltaContinuation(last, event);
    if (merged === null) {
      slots.push(event);
      continue;
    }
    slots[slots.length - 1] = merged;
  }
  return slots;
}

function planAppend(current: SessionEvent[], incoming: SessionEvent[], local: Shape): AppendedTail {
  const slots = coalesceIncoming(incoming);
  const appended = shapeOf(slots);
  let kept = current;
  let tail = slots;
  if (appended.statsCount > 0) {
    kept = withoutStats(current);
    tail = slots.filter(
      (event, index) => event.type !== 'model.stats' || index === appended.lastStatsIndex,
    );
  } else if (local.statsCount > 1) {
    kept = current.filter(
      (event, index) => event.type !== 'model.stats' || index === local.lastStatsIndex,
    );
  }
  return {
    events: [...kept, ...tail],
    decisions: tail.map((event, index) => ({
      ev: event,
      merged: false,
      index: kept.length + index,
    })),
    prunedBefore: current.length - kept.length,
  };
}

export function applyStableLog(request: IncrementalLogRequest): SessionStoreState | null {
  const current = request.state.events[request.threadId] ?? EMPTY_EVENTS;
  const bounds = reconciledBoundsOf(current);
  if (bounds === null) {
    return null;
  }
  return {
    ...request.state,
    history: { ...request.state.history, [request.threadId]: request.windowOf(bounds) },
    touchedAt: { ...request.state.touchedAt, [request.threadId]: Date.now() },
  };
}

export function applyTailAppend(request: TailAppendRequest): SessionStoreState | null {
  const current = request.state.events[request.threadId] ?? EMPTY_EVENTS;
  if (current.length === 0 || request.incoming.length === 0) {
    return null;
  }
  if (!feedHasFold(request.threadId)) {
    return null;
  }
  const local = localShapeOf(current, request);
  if (local === null) {
    return null;
  }
  const incoming = incomingShapeOf(request.incoming, request, local.maxThreadSeq);
  if (incoming === null || overlapsStreams(current, request.incoming)) {
    return null;
  }
  const plan = planAppend(current, request.incoming, local);
  const now = Date.now();
  const seenAt = fillSeenAt(
    request.state.seenAt,
    request.threadId,
    stableKeys(request.incoming),
    now,
  );
  const bounds: ThreadSeqBounds = {
    min:
      incoming.minThreadSeq === 0
        ? local.minThreadSeq
        : Math.min(local.minThreadSeq, incoming.minThreadSeq),
    max: Math.max(local.maxThreadSeq, incoming.maxThreadSeq),
  };
  return {
    ...request.state,
    events: { ...request.state.events, [request.threadId]: plan.events },
    feeds: {
      ...request.state.feeds,
      [request.threadId]: feedUpdate(
        request.threadId,
        plan.events,
        seenAt[request.threadId] ?? {},
        plan.decisions,
        plan.prunedBefore,
      ),
    },
    seenAt,
    seqCeil: { ...request.state.seqCeil, [request.threadId]: request.seqCeil },
    contentEpoch: { ...request.state.contentEpoch, [request.threadId]: now },
    history: { ...request.state.history, [request.threadId]: request.windowOf(bounds) },
    touchedAt: { ...request.state.touchedAt, [request.threadId]: now },
  };
}
