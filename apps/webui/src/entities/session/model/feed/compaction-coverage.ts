import type { SessionEvent } from '@harnesys/studio-shared';
import type { FeedRun } from './feed-types';

export type CompactionCoverageMode = 'seq' | 'legacy' | 'none';

export interface CompactionCoverage {
  mode: CompactionCoverageMode;
  boundaryThreadSeq: number | null;
  boundaryIndex: number;
  tokensBefore: number | null;
  tokensAfter: number | null;
}

const NO_COVERAGE: CompactionCoverage = {
  mode: 'none',
  boundaryThreadSeq: null,
  boundaryIndex: -1,
  tokensBefore: null,
  tokensAfter: null,
};

const coverageCache = new WeakMap<SessionEvent[], CompactionCoverage>();

export function compactionCoverage(events: SessionEvent[]): CompactionCoverage {
  const cached = coverageCache.get(events);
  if (cached !== undefined) {
    return cached;
  }
  const coverage = findCompactionCoverage(events);
  coverageCache.set(events, coverage);
  return coverage;
}

function findCompactionCoverage(events: SessionEvent[]): CompactionCoverage {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== 'compaction') {
      continue;
    }
    const tokensBefore = event.tokensBefore;
    const tokensAfter = event.tokensAfter;
    const threadSeq = event.coveredUntilThreadSeq;
    if (threadSeq === null) {
      return NO_COVERAGE;
    }
    if (threadSeq !== undefined) {
      return {
        mode: 'seq',
        boundaryThreadSeq: threadSeq,
        boundaryIndex: -1,
        tokensBefore,
        tokensAfter,
      };
    }
    if (!event.coveredUntilRunId) {
      continue;
    }
    const runId = event.coveredUntilRunId;
    const seq = event.coveredUntilSeq;
    for (let candidate = 0; candidate < events.length; candidate += 1) {
      const item = events[candidate];
      if (item.runId === runId && (seq === undefined || item.seq === seq)) {
        const boundarySeq = item.threadSeq;
        if (boundarySeq !== undefined) {
          return {
            mode: 'seq',
            boundaryThreadSeq: boundarySeq,
            boundaryIndex: -1,
            tokensBefore,
            tokensAfter,
          };
        }
        return {
          mode: 'legacy',
          boundaryThreadSeq: null,
          boundaryIndex: candidate,
          tokensBefore,
          tokensAfter,
        };
      }
    }
    return NO_COVERAGE;
  }
  return NO_COVERAGE;
}

/**
 * Legacy anchors (no `coveredUntilThreadSeq`, pre-window events) fall back to
 * the boundary event index inside the loaded window: the run's position is the
 * cumulative count of run events, which is exactly the event index while the
 * window is contiguous. An unresolved boundary (`null`) never dims.
 */
export function coveredRunCount(runs: FeedRun[], coverage: CompactionCoverage): number {
  if (coverage.mode === 'seq') {
    let count = 0;
    for (const run of runs) {
      if (!isRunCovered(run, coverage)) {
        return count;
      }
      count += 1;
    }
    return count;
  }
  if (coverage.mode === 'legacy') {
    let covered = 0;
    for (let index = 0; index < runs.length; index += 1) {
      covered += runs[index]?.events.length ?? 0;
      if (covered - 1 > coverage.boundaryIndex) {
        return index;
      }
    }
    return runs.length;
  }
  return 0;
}

export function isRunCovered(run: FeedRun, coverage: CompactionCoverage): boolean {
  if (coverage.mode !== 'seq' || coverage.boundaryThreadSeq === null || run.events.length === 0) {
    return false;
  }
  return run.lastThreadSeq !== null && run.lastThreadSeq <= coverage.boundaryThreadSeq;
}

export function firstLiveRunIndex(runs: FeedRun[], coverage: CompactionCoverage): number {
  if (coverage.mode === 'none') {
    return -1;
  }
  const covered = coveredRunCount(runs, coverage);
  return covered > 0 && covered < runs.length ? covered : -1;
}
