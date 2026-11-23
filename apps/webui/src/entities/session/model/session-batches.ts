import type { SessionEvent, SessionEventType } from '@harnesys/studio-shared';
import { LIVE_TAIL_MAX_EVENTS } from '@/shared/config/constants';
import { threadSeqBounds } from './apply-deletions';
import { applyIncomingEvents } from './apply-incoming';
import { feedUpdate } from './feed/feed-engine';
import type { FeedDecision } from './feed/feed-types';
import { EMPTY_EVENTS, type SessionStoreState, type ThreadHistoryMap } from './session-types';

export function isStreamDeltaType(type: SessionEventType): boolean {
  return type === 'text-delta' || type === 'reasoning-delta';
}
function bumpEpoch(state: SessionStoreState, threadId: string): Record<string, number> {
  return { ...state.contentEpoch, [threadId]: Date.now() };
}
function advanceCursor(
  history: ThreadHistoryMap,
  threadId: string,
  incoming: SessionEvent[],
): ThreadHistoryMap {
  const window = history[threadId];
  if (window === undefined) {
    return history;
  }
  const next = Math.max(window.maxThreadSeq, threadSeqBounds(incoming).max);
  if (next === window.maxThreadSeq) {
    return history;
  }
  return { ...history, [threadId]: { ...window, maxThreadSeq: next } };
}
export function applyBatches(
  state: SessionStoreState,
  batches: Map<string, SessionEvent[]>,
): SessionStoreState {
  if (batches.size === 0) {
    return state;
  }
  const now = Date.now();
  let next = state;
  for (const [threadId, incoming] of batches) {
    const sink: FeedDecision[] = [];
    const result = applyIncomingEvents(
      {
        events: next.events[threadId] ?? EMPTY_EVENTS,
        seenAt: next.seenAt[threadId] ?? {},
        seqCeil: next.seqCeil[threadId] ?? {},
        tailCap: next.history[threadId] === undefined ? LIVE_TAIL_MAX_EVENTS : undefined,
      },
      incoming,
      now,
      sink,
    );
    if (result.accepted === 0) {
      continue;
    }
    next = {
      ...next,
      events: { ...next.events, [threadId]: result.events },
      feeds: {
        ...next.feeds,
        [threadId]: feedUpdate(
          threadId,
          result.events,
          result.seenAt,
          result.trimmed ? null : sink,
        ),
      },
      seenAt: { ...next.seenAt, [threadId]: result.seenAt },
      seqCeil: { ...next.seqCeil, [threadId]: result.seqCeil },
      contentEpoch: bumpEpoch(next, threadId),
      history: advanceCursor(next.history, threadId, incoming),
    };
  }
  return next;
}
