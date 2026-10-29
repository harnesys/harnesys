import type { FeedRun } from '@/entities/session';

export interface TailSlice {
  inherited: FeedRun[];
  own: FeedRun[];
  hiddenCount: number;
  ownCut: number;
}

export function sliceTail(
  inheritedRuns: FeedRun[],
  ownRuns: FeedRun[],
  windowSize: number,
  unseenRunIndex: number,
): TailSlice {
  const totalRuns = inheritedRuns.length + ownRuns.length;
  const tailCut = Math.max(0, totalRuns - windowSize);
  const unseenAbsolute = unseenRunIndex >= 0 ? inheritedRuns.length + unseenRunIndex : -1;
  const start = unseenAbsolute >= 0 ? Math.min(tailCut, unseenAbsolute) : tailCut;
  const inheritedCut = Math.min(inheritedRuns.length, start);
  const ownCut = start - inheritedCut;
  const inherited = inheritedRuns.slice(inheritedCut);
  const own = ownRuns.slice(ownCut);
  return { inherited, own, hiddenCount: totalRuns - inherited.length - own.length, ownCut };
}
