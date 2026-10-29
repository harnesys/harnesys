import { describe, expect, test } from 'bun:test';
import { resolveIssueBranch, resolveIssueWorkspacePlan } from './issue-worktree-binding.ts';

describe('resolveIssueWorkspacePlan', () => {
  test('an existing worktree wins regardless of branches', () => {
    expect(
      resolveIssueWorkspacePlan({ branch: 'feature/x', activeBranch: 'main', hasWorktree: true }),
    ).toBe('worktree');
    expect(resolveIssueWorkspacePlan({ branch: null, activeBranch: null, hasWorktree: true })).toBe(
      'worktree',
    );
  });

  test('branch equal to the active checkout branch runs in the checkout', () => {
    expect(
      resolveIssueWorkspacePlan({ branch: 'main', activeBranch: 'main', hasWorktree: false }),
    ).toBe('checkout');
  });

  test('branch comparison is trim and case insensitive', () => {
    expect(
      resolveIssueWorkspacePlan({ branch: ' Main ', activeBranch: 'main', hasWorktree: false }),
    ).toBe('checkout');
    expect(
      resolveIssueWorkspacePlan({ branch: 'main', activeBranch: 'MAIN', hasWorktree: false }),
    ).toBe('checkout');
  });

  test('different branch, missing branch or missing checkout blocks the run', () => {
    expect(
      resolveIssueWorkspacePlan({ branch: 'feature/x', activeBranch: 'main', hasWorktree: false }),
    ).toBe('blocked');
    expect(
      resolveIssueWorkspacePlan({ branch: null, activeBranch: 'main', hasWorktree: false }),
    ).toBe('blocked');
    expect(
      resolveIssueWorkspacePlan({ branch: 'main', activeBranch: null, hasWorktree: false }),
    ).toBe('blocked');
    expect(
      resolveIssueWorkspacePlan({ branch: null, activeBranch: null, hasWorktree: false }),
    ).toBe('blocked');
  });
});

describe('resolveIssueBranch', () => {
  test('the branch column wins when present', () => {
    expect(resolveIssueBranch({ branch: 'feature/x', worktreeBaseBranch: 'main' })).toBe(
      'feature/x',
    );
  });

  test('legacy rows fall back to worktreeBaseBranch when branch is null', () => {
    expect(resolveIssueBranch({ branch: null, worktreeBaseBranch: 'main' })).toBe('main');
  });

  test('returns null when both columns are empty', () => {
    expect(resolveIssueBranch({ branch: null, worktreeBaseBranch: null })).toBe(null);
  });
});
