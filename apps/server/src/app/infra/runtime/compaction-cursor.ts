import type { SessionEvent } from 'harnesys';

export interface CompactionBoundary {
  runId: string;
  seq: number;
  /** Null when the covered source event carries no thread cursor (should not happen for thread runs). */
  threadSeq: number | null;
}

/**
 * Maps a compaction's `coveredUntil` message index onto the thread event that
 * produced it. `coveredTotal` is the message list length the plan indices were
 * taken against; a rebuild of the stored stream that comes out a different
 * length means replay diverged from the live state and no cursor may be trusted.
 */
export function resolveCompactionCursor(input: {
  rebuiltCount: number;
  coveredTotal: number | undefined;
  coveredUntil: number;
  sources: number[];
  sliced: SessionEvent[];
}): CompactionBoundary | null {
  const { rebuiltCount, coveredTotal, coveredUntil, sources, sliced } = input;
  if (typeof coveredTotal !== 'number' || rebuiltCount !== coveredTotal) {
    return null;
  }
  if (coveredUntil < 0 || coveredUntil >= sources.length) {
    return null;
  }
  const sourceIndex = sources[coveredUntil];
  if (sourceIndex === undefined || sourceIndex < 0 || sourceIndex >= sliced.length) {
    return null;
  }
  const event = sliced[sourceIndex];
  if (!event) {
    return null;
  }
  const runId = event.runId ?? '';
  const seq = event.seq;
  if (!runId || typeof seq !== 'number') {
    return null;
  }
  return {
    runId,
    seq,
    threadSeq: typeof event.threadSeq === 'number' ? event.threadSeq : null,
  };
}
