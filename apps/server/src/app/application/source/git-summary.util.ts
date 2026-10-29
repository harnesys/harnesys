import type { GitSourceSummary, GitSummaryCounts } from '@harnesys/studio-shared';

export type { GitSourceSummary, GitSummaryCounts };

function emptyCounts(): GitSummaryCounts {
  return { modified: 0, staged: 0, untracked: 0, conflicted: 0 };
}

function isConflicted(xy: string): boolean {
  return xy.includes('U') || xy === 'AA' || xy === 'DD';
}

export function summarizePorcelain(lines: string[]): GitSummaryCounts {
  const counts = emptyCounts();
  for (const line of lines) {
    const xy = line.slice(0, 2);
    if (!xy.trim() || xy === '!!' || xy.startsWith('##') || xy.startsWith('#')) {
      continue;
    }
    if (isConflicted(xy)) {
      counts.conflicted++;
      continue;
    }
    if (xy === '??') {
      counts.untracked++;
      continue;
    }
    const x = xy[0] ?? ' ';
    const y = xy[1] ?? ' ';
    if (x !== ' ') {
      counts.staged++;
    }
    if (y !== ' ') {
      counts.modified++;
    }
  }
  return counts;
}

export function mergeSummaryResults(
  results: readonly (GitSourceSummary | null | undefined)[],
): GitSourceSummary[] {
  const byId = new Map<string, GitSourceSummary>();
  for (const item of results) {
    if (!item) {
      continue;
    }
    byId.set(item.sourceId, item);
  }
  return [...byId.values()];
}
