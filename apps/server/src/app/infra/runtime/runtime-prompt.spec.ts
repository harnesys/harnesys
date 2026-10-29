import { describe, expect, test } from 'bun:test';
import type { MaterializationOrigin, MaterializationState, SourceVcs } from '@harnesys/contracts';
import type { HostConfig } from '../../domain/machine/machine-config.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type {
  RepositoryWorktree,
  RepositoryWorktreeState,
} from '../../domain/source/repository-worktree.ts';
import type {
  MaterializationProjectionRecord,
  MaterializationRecord,
  MaterializationRevisionDecision,
  UpsertMaterializationInput,
} from '../../domain/source/source-materialization.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { InsertSourceInput, SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { runRuntimePromptInfo } from './runtime-prompt.ts';

const ORG = 'org-1';
const HOST_LOCAL = 'host-local';
const SRC = 'src-1';

class FakeMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: HOST_LOCAL, name: 'local', listen: ':0', token: '' };
  }

  set(): void {
    throw new Error('not used');
  }
}

class FakeMaterializations extends SourceMaterializationPort {
  constructor(private readonly localPath: string | null) {
    super();
  }

  find(orgId: string, sourceId: string, hostId: string): MaterializationRecord | null {
    if (hostId !== HOST_LOCAL || this.localPath === null) {
      return null;
    }
    return {
      orgId,
      sourceId,
      hostId,
      origin: 'git' as MaterializationOrigin,
      localPath: this.localPath,
      state: 'ready' as MaterializationState,
      lastError: null,
      revision: 1,
      updatedAt: '2026-10-22T00:00:00.000Z',
      lastConflictPaths: [],
      refreshRequired: false,
    };
  }

  listForSource(): MaterializationRecord[] {
    throw new Error('not used');
  }

  upsert(_input: UpsertMaterializationInput): void {
    throw new Error('not used');
  }

  removeForSource(): void {
    throw new Error('not used');
  }

  findProjection(): MaterializationProjectionRecord | null {
    throw new Error('not used');
  }

  listProjectionsForSource(): MaterializationProjectionRecord[] {
    throw new Error('not used');
  }

  upsertProjection(): MaterializationRevisionDecision {
    throw new Error('not used');
  }
}

class FakeSources extends SourceRegistryPort {
  constructor(private readonly vcs: SourceVcs | null) {
    super();
  }

  findById(_orgId: string, sourceId: string): SourceRecord {
    return {
      id: sourceId,
      orgId: ORG,
      name: 'harnesys',
      description: 'monorepo',
      distribution: { kind: 'host-bound', hostId: HOST_LOCAL },
      uiVisibility: 'org',
      managed: false,
      vcs: this.vcs,
      availability: { hostIds: [HOST_LOCAL] },
      lspJson: null,
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    };
  }

  list(): SourceRecord[] {
    throw new Error('not used');
  }

  findManagedWorkspace(): SourceRecord | null {
    throw new Error('not used');
  }

  insert(_input: InsertSourceInput): void {
    throw new Error('not used');
  }

  updateVisibility(): void {
    throw new Error('not used');
  }

  updateName(): void {
    throw new Error('not used');
  }

  updateDistribution(): void {
    throw new Error('not used');
  }

  updateVcs(): void {
    throw new Error('not used');
  }

  updateAvailability(): void {
    throw new Error('not used');
  }

  updateLspJson(): void {
    throw new Error('not used');
  }

  remove(): void {
    throw new Error('not used');
  }
}

class FakeWorktrees extends RepositoryWorktreePort {
  constructor(private readonly branch: string | null) {
    super();
  }

  findById(_orgId: string, _worktreeId: string): RepositoryWorktree | null {
    if (this.branch === null) {
      return null;
    }
    return {
      id: 'wt-1',
      orgId: ORG,
      sourceId: SRC,
      hostId: HOST_LOCAL,
      branch: this.branch,
      baseCommit: null,
      state: 'ready' as RepositoryWorktreeState,
      activeRunId: null,
      operationId: 'op-1',
      issueId: null,
      lastErrorCode: null,
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    };
  }

  findByOperationId(): RepositoryWorktree | null {
    throw new Error('not used');
  }

  findActiveByBranch(): RepositoryWorktree | null {
    throw new Error('not used');
  }

  listCreating(): RepositoryWorktree[] {
    throw new Error('not used');
  }

  listForSource(): RepositoryWorktree[] {
    throw new Error('not used');
  }

  listForHost(): RepositoryWorktree[] {
    throw new Error('not used');
  }

  listForIssue(): RepositoryWorktree[] {
    throw new Error('not used');
  }

  upsert(): RepositoryWorktree {
    throw new Error('not used');
  }

  setState(): void {
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

const REMOTE_VCS: SourceVcs = {
  engine: 'git',
  remoteUrl: 'https://github.com/org/repo',
  credRef: null,
  defaultBranch: 'main',
};

function prepared(
  preparedHost: string,
  activeWorktree?: { worktreeId: string; sourceId: string; root: string },
) {
  return {
    agent: { id: 'agent-1', sharedSourceIds: [SRC] },
    runtime: {
      hostId: preparedHost,
      primaryDirectory: '/org/thread/sandbox',
      primaryKind: 'sandbox' as const,
      threadSandbox: '/org/thread/sandbox',
      ...(activeWorktree ? { activeWorktree } : {}),
    },
  };
}

function sourcePrepared(kind: 'git' | 'folder') {
  return {
    agent: { id: 'agent-1', sharedSourceIds: [SRC] },
    runtime: {
      hostId: HOST_LOCAL,
      primaryDirectory: '/shared/harnesys',
      primaryKind: 'source' as const,
      threadSandbox: '/org/thread/sandbox',
      primarySource: { sourceId: SRC, name: 'harnesys', kind },
    },
  };
}

describe('runRuntimePromptInfo', () => {
  test('includes shared source only when materialized on the current host', () => {
    const onHost = runRuntimePromptInfo(
      {
        orgId: ORG,
        machineConfig: new FakeMachineConfig(),
        sources: new FakeSources(null),
        materializations: new FakeMaterializations('/shared/harnesys'),
      },
      prepared(HOST_LOCAL),
      undefined,
    );
    expect(onHost.sharedSources).toEqual([
      {
        name: 'harnesys',
        path: '/shared/harnesys',
        description: 'monorepo',
        indexState: 'not-indexed',
      },
    ]);

    const notOnHost = runRuntimePromptInfo(
      {
        orgId: ORG,
        machineConfig: new FakeMachineConfig(),
        sources: new FakeSources(null),
        materializations: new FakeMaterializations(null),
      },
      prepared(HOST_LOCAL),
      undefined,
    );
    expect(notOnHost.sharedSources).toEqual([]);
  });

  test('container binding yields container environment, host binding yields host', () => {
    const deps = {
      orgId: ORG,
      machineConfig: new FakeMachineConfig(),
      sources: new FakeSources(null),
      materializations: new FakeMaterializations(null),
    };
    const container = runRuntimePromptInfo(deps, prepared(HOST_LOCAL), {
      isolation: { mode: 'container', image: 'img' },
    });
    expect(container.environment).toBe('container');
    const host = runRuntimePromptInfo(deps, prepared(HOST_LOCAL), undefined);
    expect(host.environment).toBe('host');
  });

  test('active worktree renders worktree block with repository and branch', () => {
    const info = runRuntimePromptInfo(
      {
        orgId: ORG,
        machineConfig: new FakeMachineConfig(),
        sources: new FakeSources(REMOTE_VCS),
        materializations: new FakeMaterializations(null),
        worktrees: new FakeWorktrees('feat/x'),
      },
      prepared(HOST_LOCAL, {
        worktreeId: 'wt-1',
        sourceId: SRC,
        root: '/worktrees/repo-feat-x',
      }),
      undefined,
    );
    expect(info.worktree).toEqual({
      repository: 'https://github.com/org/repo',
      branch: 'feat/x',
      path: '/worktrees/repo-feat-x',
    });
  });

  test('source primary fills the prompt source with kind and bound branch for git', () => {
    const base = {
      orgId: ORG,
      machineConfig: new FakeMachineConfig(),
      materializations: new FakeMaterializations(null),
    };
    const gitDeps = { ...base, sources: new FakeSources(REMOTE_VCS) };
    const git = runRuntimePromptInfo(gitDeps, sourcePrepared('git'), { branch: 'feat/x' });
    expect(git.primarySource).toEqual({ name: 'harnesys', kind: 'git', branch: 'feat/x' });
    const unbound = runRuntimePromptInfo(gitDeps, sourcePrepared('git'), undefined);
    expect(unbound.primarySource).toEqual({ name: 'harnesys', kind: 'git' });
    const folder = runRuntimePromptInfo(
      { ...base, sources: new FakeSources(null) },
      sourcePrepared('folder'),
      undefined,
    );
    expect(folder.primarySource).toEqual({ name: 'harnesys', kind: 'folder' });
    expect(folder.worktree).toBeUndefined();
  });
});
