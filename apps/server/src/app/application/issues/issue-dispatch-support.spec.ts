import { describe, expect, test } from 'bun:test';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import {
  blockedWorktreeNotificationText,
  checkoutSiblingNotificationText,
  issueBranchOf,
  pickCheckoutSibling,
  resolveCheckoutBranch,
  resolveDispatchSource,
  resolveIssueWorkspace,
  shouldAutoCreateWorktree,
  worktreeAutoCreateFailedText,
} from './issue-dispatch-support.ts';

const NOW = new Date(0).toISOString();

function issueRecord(parts: Partial<IssueRecord> = {}): IssueRecord {
  return {
    id: 'issue-1',
    orgId: 'org-1',
    boardId: 'board-1',
    title: 'Fix dispatch',
    description: '',
    statusKey: 'todo',
    priority: 2,
    type: 'task',
    assigneeAgentId: null,
    labels: [],
    parentIssueId: null,
    dueDate: null,
    closedAt: null,
    fireTrail: [],
    sourceId: 'src-1',
    branch: 'main',
    worktreeOnStatus: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...parts,
  };
}

function sourceRecord(id: string): SourceRecord {
  return {
    id,
    orgId: 'org-1',
    name: id,
    description: null,
    distribution: { kind: 'host-bound', hostId: 'host-1' },
    uiVisibility: 'org',
    managed: true,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createSources(parts: {
  byId?: SourceRecord | null;
  workspace?: SourceRecord | null;
}): SourceRegistryPort {
  const port: Pick<SourceRegistryPort, 'findById' | 'findManagedWorkspace'> = {
    findById: (_orgId, sourceId) => (parts.byId?.id === sourceId ? parts.byId : null),
    findManagedWorkspace: () => parts.workspace ?? null,
  };
  return port as SourceRegistryPort;
}

function createWorktrees(active: RepositoryWorktree | null): RepositoryWorktreePort {
  const port: Pick<RepositoryWorktreePort, 'findActiveByBranch'> = {
    findActiveByBranch: () => active,
  };
  return port as RepositoryWorktreePort;
}

function createMaterializations(localPath: string | null): SourceMaterializationPort {
  const port: Pick<SourceMaterializationPort, 'find'> = {
    find: () =>
      localPath === null
        ? null
        : {
            orgId: 'org-1',
            sourceId: 'src-1',
            hostId: 'host-1',
            origin: 'managed',
            localPath,
            state: 'ready',
            revision: 1,
            updatedAt: NOW,
            lastError: null,
            lastConflictPaths: [],
            refreshRequired: false,
          },
  };
  return port as SourceMaterializationPort;
}

function createDriver(branch: string | null, seen: { layout?: unknown } = {}): SourceDriverPort {
  const port: Pick<SourceDriverPort, 'kind' | 'observeWorktree'> = {
    kind: 'git',
    observeWorktree: (layout) => {
      seen.layout = layout;
      return Promise.resolve({ dirty: false, unpushed: false, branch, head: null });
    },
  };
  return port as SourceDriverPort;
}

const layout = {
  orgSourceDir: () => '/org/src',
  sourceWorktreesDir: () => '/org/wt',
} as never;

function workspaceInput(parts: {
  issue: IssueRecord;
  sources: SourceRegistryPort;
  worktrees?: RepositoryWorktreePort;
  materializations?: SourceMaterializationPort;
  driver?: SourceDriverPort;
}) {
  return {
    orgId: 'org-1',
    localHostId: 'host-1',
    issue: parts.issue,
    sources: parts.sources,
    worktrees: parts.worktrees ?? createWorktrees(null),
    materializations: parts.materializations ?? createMaterializations('/org/wt/checkout'),
    layout,
    driver: parts.driver ?? createDriver('main'),
  };
}

describe('issueBranchOf', () => {
  test('trims and normalizes blank branch to null', () => {
    expect(issueBranchOf(issueRecord({ branch: ' feature/x ' }))).toBe('feature/x');
    expect(issueBranchOf(issueRecord({ branch: '   ' }))).toBe(null);
    expect(issueBranchOf(issueRecord({ branch: null }))).toBe(null);
  });
});

describe('resolveDispatchSource', () => {
  test('issue source wins, managed workspace is the default', () => {
    const own = sourceRecord('src-1');
    const ws = sourceRecord('src-ws');
    const sources = createSources({ byId: own, workspace: ws });
    expect(resolveDispatchSource(sources, 'org-1', issueRecord())?.id).toBe('src-1');
    expect(resolveDispatchSource(sources, 'org-1', issueRecord({ sourceId: null }))?.id).toBe(
      'src-ws',
    );
  });
});

describe('resolveIssueWorkspace', () => {
  test('unbound when the issue has no branch, even with a source', async () => {
    const resolved = await resolveIssueWorkspace(
      workspaceInput({
        issue: issueRecord({ branch: null }),
        sources: createSources({ byId: sourceRecord('src-1') }),
      }),
    );
    expect(resolved).toEqual({ plan: 'unbound', sourceId: 'src-1', branch: null, worktree: null });
  });

  test('blocked when the branch cannot be resolved to a source', async () => {
    const resolved = await resolveIssueWorkspace(
      workspaceInput({ issue: issueRecord(), sources: createSources({}) }),
    );
    expect(resolved).toEqual({ plan: 'blocked', sourceId: null, branch: 'main', worktree: null });
  });

  test('worktree plan when an active worktree exists for the branch', async () => {
    const row = { id: 'wt-1', state: 'ready' } as RepositoryWorktree;
    const resolved = await resolveIssueWorkspace(
      workspaceInput({
        issue: issueRecord(),
        sources: createSources({ byId: sourceRecord('src-1') }),
        worktrees: createWorktrees(row),
      }),
    );
    expect(resolved.plan).toBe('worktree');
    expect(resolved.worktree?.id).toBe('wt-1');
  });

  test('checkout plan when the source checkout is on the issue branch', async () => {
    const resolved = await resolveIssueWorkspace(
      workspaceInput({
        issue: issueRecord(),
        sources: createSources({ byId: sourceRecord('src-1') }),
        driver: createDriver('main'),
      }),
    );
    expect(resolved.plan).toBe('checkout');
    expect(resolved.worktree).toBe(null);
  });

  test('blocked when the checkout sits on another branch', async () => {
    const resolved = await resolveIssueWorkspace(
      workspaceInput({
        issue: issueRecord(),
        sources: createSources({ byId: sourceRecord('src-1') }),
        driver: createDriver('develop'),
      }),
    );
    expect(resolved.plan).toBe('blocked');
  });

  test('default managed workspace source is used when the issue has none', async () => {
    const resolved = await resolveIssueWorkspace(
      workspaceInput({
        issue: issueRecord({ sourceId: null }),
        sources: createSources({ workspace: sourceRecord('src-ws') }),
        driver: createDriver('main'),
      }),
    );
    expect(resolved.plan).toBe('checkout');
    expect(resolved.sourceId).toBe('src-ws');
  });
});

describe('resolveCheckoutBranch', () => {
  test('observes the materialized checkout directory via the driver', async () => {
    const seen: { layout?: unknown } = {};
    const branch = await resolveCheckoutBranch({
      orgId: 'org-1',
      sourceId: 'src-1',
      localHostId: 'host-1',
      materializations: createMaterializations('/org/wt/checkout'),
      layout,
      driver: createDriver('main', seen),
    });
    expect(branch).toBe('main');
    expect(seen.layout).toEqual({ bareRepoPath: '/org/src', worktreesRoot: '/org/wt' });
  });

  test('null when the source is not materialized or the driver fails', async () => {
    const absent = await resolveCheckoutBranch({
      orgId: 'org-1',
      sourceId: 'src-1',
      localHostId: 'host-1',
      materializations: createMaterializations(null),
      layout,
      driver: createDriver('main'),
    });
    expect(absent).toBe(null);
    const failingDriver: Pick<SourceDriverPort, 'kind' | 'observeWorktree'> = {
      kind: 'git',
      observeWorktree: () => Promise.reject(new Error('no git')),
    };
    const failed = await resolveCheckoutBranch({
      orgId: 'org-1',
      sourceId: 'src-1',
      localHostId: 'host-1',
      materializations: createMaterializations('/org/wt/checkout'),
      layout,
      driver: failingDriver as SourceDriverPort,
    });
    expect(failed).toBe(null);
  });
});

describe('pickCheckoutSibling', () => {
  const sibling = issueRecord({ id: 'issue-2', title: 'Sibling', branch: 'main' });
  const rows = [
    sibling,
    issueRecord({ id: 'issue-3', title: 'Closed', branch: 'main', closedAt: NOW }),
    issueRecord({ id: 'issue-4', title: 'Other source', branch: 'main', sourceId: 'src-9' }),
    issueRecord({ id: 'issue-5', title: 'Other branch', branch: 'feature' }),
  ];

  test('finds the open sibling issue on the same source and branch', () => {
    const picked = pickCheckoutSibling(rows, issueRecord(), 'src-1', 'main');
    expect(picked?.id).toBe('issue-2');
  });

  test('no sibling on an unmatched branch, missing refs or self only', () => {
    expect(pickCheckoutSibling(rows, issueRecord(), 'src-1', 'solo')).toBe(null);
    expect(pickCheckoutSibling([sibling], sibling, 'src-1', 'main')).toBe(null);
    expect(pickCheckoutSibling(rows, issueRecord(), 'src-1', null)).toBe(null);
  });
});

describe('notification texts', () => {
  test('blocked text carries the branch and the escape hatches', () => {
    expect(blockedWorktreeNotificationText('feature/x')).toBe(
      'issue needs a worktree for branch feature/x — create it on the issue (Create now / auto on status)',
    );
  });

  test('sibling warning names the sibling issue', () => {
    expect(
      checkoutSiblingNotificationText(
        { id: 'issue-2', title: 'Sibling', sourceId: null, branch: null, closedAt: null },
        'main',
      ),
    ).toBe(
      'open issue "Sibling" (issue-2) also uses branch main — the checkout is shared, run them sequentially or give this issue its own worktree',
    );
  });

  test('auto-create failure text carries branch and reason', () => {
    expect(worktreeAutoCreateFailedText('main', 'no ready host')).toBe(
      'worktree auto-create for branch main failed: no ready host — create it manually on the issue',
    );
  });
});

describe('shouldAutoCreateWorktree', () => {
  test('fires on entering the hook status with branch and source and no worktree', () => {
    expect(
      shouldAutoCreateWorktree({
        issue: issueRecord({ worktreeOnStatus: 'in_progress' }),
        enteredStatusKey: 'in_progress',
        hasActiveWorktree: false,
      }),
    ).toBe(true);
  });

  test('skips on other status, missing branch or source, or existing worktree', () => {
    const hook = {
      issue: issueRecord({ worktreeOnStatus: 'in_progress' }),
      enteredStatusKey: 'done',
      hasActiveWorktree: false,
    };
    expect(shouldAutoCreateWorktree(hook)).toBe(false);
    expect(
      shouldAutoCreateWorktree({
        ...hook,
        issue: issueRecord({ branch: null, worktreeOnStatus: 'in_progress' }),
      }),
    ).toBe(false);
    expect(
      shouldAutoCreateWorktree({
        ...hook,
        issue: issueRecord({ sourceId: null, worktreeOnStatus: 'in_progress' }),
      }),
    ).toBe(false);
    expect(shouldAutoCreateWorktree({ ...hook, hasActiveWorktree: true })).toBe(false);
  });
});
