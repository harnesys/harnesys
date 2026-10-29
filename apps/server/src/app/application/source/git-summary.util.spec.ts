import { expect, test } from 'bun:test';
import {
  type GitSourceSummary,
  mergeSummaryResults,
  summarizePorcelain,
} from './git-summary.util.ts';

test('summarizePorcelain counts by category', () => {
  const counts = summarizePorcelain([' M a', 'A  b', '?? c', 'UU d']);
  expect(counts).toEqual({ modified: 1, staged: 1, untracked: 1, conflicted: 1 });
});

test('summarizePorcelain splits staged and worktree for MM and counts renames as staged', () => {
  const counts = summarizePorcelain(['MM a', 'R  b', 'D  c', ' M d']);
  expect(counts.staged).toBe(3);
  expect(counts.modified).toBe(2);
});

test('summarizePorcelain skips empty lines and branch header from porcelain -b', () => {
  const empty = summarizePorcelain([]);
  expect(empty).toEqual({ modified: 0, staged: 0, untracked: 0, conflicted: 0 });
  const withHeader = summarizePorcelain([
    '## main...origin/main [ahead 2]',
    '',
    '   ',
    '# comment',
    ' M file.ts',
  ]);
  expect(withHeader).toEqual({ modified: 1, staged: 0, untracked: 0, conflicted: 0 });
});

test('summarizePorcelain does not count ignored entries', () => {
  const counts = summarizePorcelain(['!! secret.key']);
  expect(counts).toEqual({ modified: 0, staged: 0, untracked: 0, conflicted: 0 });
});

test('mergeSummaryResults keeps healthy entries around a broken one', () => {
  const input: GitSourceSummary[] = [
    {
      sourceId: 's1',
      isGit: true,
      branch: 'main',
      counts: { modified: 1, staged: 0, untracked: 0, conflicted: 0 },
    },
    { sourceId: 's2', isGit: false, skipped: 'git-error' },
    { sourceId: 's3', isGit: false, skipped: 'not-materialized' },
  ];
  expect(mergeSummaryResults(input)).toEqual(input);
});

test('mergeSummaryResults dedupes by sourceId keeping last and drops nullish', () => {
  const failed: GitSourceSummary = { sourceId: 's1', isGit: false, skipped: 'git-error' };
  const fixed: GitSourceSummary = { sourceId: 's1', isGit: true, branch: 'dev' };
  const input = [failed, undefined, fixed, null];
  const merged = mergeSummaryResults(input);
  expect(merged).toHaveLength(1);
  expect(merged[0]?.isGit).toBe(true);
});
