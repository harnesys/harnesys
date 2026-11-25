import type { FeedRun } from '@/entities/session';

export function runIndexForSeq(runs: FeedRun[], threadSeq: number): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const first = run?.firstThreadSeq;
    const last = run?.lastThreadSeq;
    if (first === null || first === undefined || last === null || last === undefined) {
      continue;
    }
    let distance = 0;
    if (threadSeq < first) {
      distance = first - threadSeq;
    } else if (threadSeq > last) {
      distance = threadSeq - last;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}
