import { describe, expect, test } from 'bun:test';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type {
  RepositoryWorktree,
  RepositoryWorktreeState,
} from '../../domain/source/repository-worktree.ts';
import { WorktreeNotFoundException } from '../../domain/source/source.error.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import { resolveWorktreeBinding } from './send-thread-worktree.ts';

const ORG = 'org-1';

const WORKTREE: RepositoryWorktree = {
  id: 'wt-1',
  orgId: ORG,
  sourceId: 'src-1',
  hostId: 'host-1',
  branch: 'feat/x',
  baseCommit: null,
  state: 'ready',
  activeRunId: null,
  operationId: 'op-1',
  issueId: null,
  lastErrorCode: null,
  createdAt: '2026-10-22T00:00:00.000Z',
  updatedAt: '2026-10-22T00:00:00.000Z',
};

class FakeWorktrees extends RepositoryWorktreePort {
  constructor(private readonly row: RepositoryWorktree | null) {
    super();
  }

  findById(_orgId: string, worktreeId: string): RepositoryWorktree | null {
    return this.row?.id === worktreeId ? this.row : null;
  }

  findByOperationId(): null {
    return null;
  }

  findActiveByBranch(): null {
    return null;
  }

  listCreating(): [] {
    return [];
  }

  listForSource(): [] {
    return [];
  }

  listForHost(): [] {
    return [];
  }

  listForIssue(): [] {
    return [];
  }

  upsert(): never {
    throw new Error('not used');
  }

  setState(
    _orgId: string,
    _worktreeId: string,
    _patch: { state: RepositoryWorktreeState; updatedAt: string },
  ): void {
    throw new Error('not used');
  }

  setActiveRunId(): void {
    throw new Error('not used');
  }

  clearActiveRun(): void {
    throw new Error('not used');
  }

  remove(): void {
    throw new Error('not used');
  }
}

function bindingInput(agentSharedSourceIds: string[]) {
  return {
    orgId: ORG,
    sourceId: 'src-1',
    worktreeId: 'wt-1',
    agentSharedSourceIds,
    worktrees: new FakeWorktrees(WORKTREE),
  };
}

describe('resolveWorktreeBinding source sharing', () => {
  test('shared source resolves binding with host pin', () => {
    const binding = resolveWorktreeBinding(bindingInput(['src-1']));
    expect(binding).toEqual({ sourceId: 'src-1', worktreeId: 'wt-1', hostId: 'host-1' });
  });

  test('source outside shared list is rejected', () => {
    expect(() => resolveWorktreeBinding(bindingInput(['src-2']))).toThrow(
      new ThreadValidationException('worktree source not shared with agent: src-1'),
    );
  });

  test('worktree row missing for shared source is not found', () => {
    expect(() =>
      resolveWorktreeBinding({ ...bindingInput(['src-1']), worktrees: new FakeWorktrees(null) }),
    ).toThrow(new WorktreeNotFoundException('wt-1'));
  });
});
