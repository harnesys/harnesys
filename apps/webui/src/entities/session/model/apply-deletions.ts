import type { ThreadLogDeletion } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import { stableEventKey } from './event-keys';
import { feedUpdate } from './feed/feed-engine';
import type { SessionStoreState } from './session-types';

export interface ThreadSeqBounds {
  min: number;
  max: number;
}

export function threadSeqBounds(events: SessionEvent[]): ThreadSeqBounds {
  let min = 0;
  let max = 0;
  let seen = false;
  for (const event of events) {
    const seq = event.threadSeq;
    if (seq === undefined) {
      continue;
    }
    if (!seen) {
      min = seq;
      max = seq;
      seen = true;
      continue;
    }
    if (seq < min) {
      min = seq;
    }
    if (seq > max) {
      max = seq;
    }
  }
  return { min, max };
}

function inRange(threadSeq: number | undefined, deletion: ThreadLogDeletion): boolean {
  if (threadSeq === undefined) {
    return false;
  }
  return threadSeq >= deletion.from && (deletion.to === 0 || threadSeq <= deletion.to);
}

function pruneSeenAt(
  seenAt: Record<string, Record<string, number>>,
  threadId: string,
  dropped: SessionEvent[],
): Record<string, Record<string, number>> {
  const threadSeen = seenAt[threadId];
  if (threadSeen === undefined) {
    return seenAt;
  }
  const next = { ...threadSeen };
  let changed = false;
  for (const event of dropped) {
    const key = stableEventKey(event);
    if (key !== undefined && next[key] !== undefined) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? { ...seenAt, [threadId]: next } : seenAt;
}

export function withoutSentSkills(
  sentSkills: Record<string, string[]>,
  events: SessionEvent[],
): Record<string, string[]> {
  let next = sentSkills;
  for (const event of events) {
    const key = stableEventKey(event);
    if (key === undefined || next[key] === undefined) {
      continue;
    }
    if (next === sentSkills) {
      next = { ...sentSkills };
    }
    delete next[key];
  }
  return next;
}

export function dropDeletedEvents(
  state: SessionStoreState,
  threadId: string,
  deletions: ThreadLogDeletion[],
): SessionStoreState {
  const current = state.events[threadId];
  if (current === undefined || current.length === 0 || deletions.length === 0) {
    return state;
  }
  const dropped: SessionEvent[] = [];
  const kept: SessionEvent[] = [];
  for (const event of current) {
    if (deletions.some((deletion) => inRange(event.threadSeq, deletion))) {
      dropped.push(event);
      continue;
    }
    kept.push(event);
  }
  if (dropped.length === 0) {
    return state;
  }
  const window = state.history[threadId];
  return {
    ...state,
    events: { ...state.events, [threadId]: kept },
    feeds: {
      ...state.feeds,
      [threadId]: feedUpdate(threadId, kept, state.seenAt[threadId] ?? {}, null),
    },
    seenAt: pruneSeenAt(state.seenAt, threadId, dropped),
    sentSkills: withoutSentSkills(state.sentSkills, dropped),
    contentEpoch: { ...state.contentEpoch, [threadId]: Date.now() },
    history:
      window === undefined
        ? state.history
        : {
            ...state.history,
            [threadId]: { ...window, windowVersion: window.windowVersion + 1 },
          },
  };
}
