import { describe, expect, test } from 'bun:test';
import { gitWorktreePath } from './git-repository-layout.ts';
import {
  canDeleteWorktree,
  explainWorktreeDeleteBlock,
  isActiveWorktreeState,
  worktreeDeleteBlockers,
} from './repository-worktree.ts';

describe('repository-worktree helpers', () => {
  test('worktree path is single safe id under sibling root', () => {
    expect(
      gitWorktreePath(
        { bareRepoPath: '/data/sources/s1', worktreesRoot: '/data/sources/s1.worktrees' },
        'wt-1',
      ),
    ).toBe('/data/sources/s1.worktrees/wt-1');
    expect(() =>
      gitWorktreePath(
        { bareRepoPath: '/data/sources/s1', worktreesRoot: '/data/sources/s1.worktrees' },
        '../x',
      ),
    ).toThrow(/invalid worktree id/);
  });

  test('allows delete when clean and idle', () => {
    const blockers = worktreeDeleteBlockers({
      activeRunId: null,
      observation: { dirty: false, unpushed: false, branch: 'main', head: 'abc' },
    });
    expect(canDeleteWorktree(blockers)).toBe(true);
    expect(explainWorktreeDeleteBlock(blockers)).toBeNull();
  });

  test('blocks dirty/unpushed/active and treats failed as inactive', () => {
    expect(
      canDeleteWorktree(
        worktreeDeleteBlockers({
          activeRunId: 'run-1',
          observation: { dirty: true, unpushed: true, branch: 'main', head: 'abc' },
        }),
      ),
    ).toBe(false);
    expect(isActiveWorktreeState('ready')).toBe(true);
    expect(isActiveWorktreeState('failed')).toBe(false);
  });
});
