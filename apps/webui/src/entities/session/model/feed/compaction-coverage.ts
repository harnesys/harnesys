import type { SessionEvent } from '@harnesys/studio-shared';
import type { FeedRun } from './feed-types';

export interface CompactionCoverage {
  boundaryIndex: number;
  tokensBefore: number | null;
  tokensAfter: number | null;
}

const NO_COVERAGE: CompactionCoverage = {
  boundaryIndex: -1,
  tokensBefore: null,
  tokensAfter: null,
};

export function compactionCoverage(events: SessionEvent[]): CompactionCoverage {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'compaction' || !event.coveredUntilRunId) {
      continue;
    }
    const runId = event.coveredUntilRunId;
    const seq = event.coveredUntilSeq;
    for (let candidate = 0; candidate < events.length; candidate += 1) {
      const item = events[candidate];
      if (item.runId === runId && (seq === undefined || item.seq === seq)) {
        return {
          boundaryIndex: candidate,
          tokensBefore: event.tokensBefore,
          tokensAfter: event.tokensAfter,
        };
      }
    }
    return NO_COVERAGE;
  }
  return NO_COVERAGE;
}

export function isRunCovered(run: FeedRun, boundaryIndex: number): boolean {
  if (boundaryIndex < 0 || run.events.length === 0) {
    return false;
  }
  return run.firstIndex + run.events.length - 1 <= boundaryIndex;
}

export function firstLiveRunIndex(
  inheritedRuns: FeedRun[],
  ownRuns: FeedRun[],
  boundaryIndex: number,
): number {
  if (boundaryIndex < 0) {
    return -1;
  }
  for (let index = 0; index < inheritedRuns.length; index += 1) {
    if (!isRunCovered(inheritedRuns[index], boundaryIndex)) {
      return index;
    }
  }
  for (let index = 0; index < ownRuns.length; index += 1) {
    if (!isRunCovered(ownRuns[index], boundaryIndex)) {
      return inheritedRuns.length + index;
    }
  }
  return -1;
}
