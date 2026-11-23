import { describe, expect, test } from 'bun:test';
import type { WorkspaceRef } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type {
  RepositoryWorktree,
  RepositoryWorktreeState,
} from '../../domain/source/repository-worktree.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  type ResolveRunEnvironmentDeps,
  resolveRunEnvironment,
} from './resolve-run-environment.ts';

const ORG = 'org-1';
const NOW = '2026-11-23T00:00:00.000Z';

function thread(workspaceRef: WorkspaceRef | null): ThreadRecord {
  return {
    id: 'thread-1',
    orgId: ORG,
    title: 't',
    kind: 'issue',
    autoReplyAgentId: null,
    policy: { version: 1 },
    lastThreadSeq: 0,
    conversationCount: 0,
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    workspaceRef,
    createdAt: NOW,
    updatedAt: NOW,
    lastReadAt: NOW,
  };
}

function agent(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agent-1',
    orgId: ORG,
    name: 'coder',
    role: 'coder',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
    sharedSourceIds: ['src-1'],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    defaultRunDirectory: null,
    defaultWorkspaceRef: null,
    config: {},
    hooks: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function worktree(state: RepositoryWorktreeState): RepositoryWorktree {
  return {
    id: 'wt-1',
    orgId: ORG,
    sourceId: 'src-1',
    hostId: 'host-1',
    branch: 'feat/x',
    baseCommit: null,
    state,
    activeRunId: null,
    operationId: 'op-1',
    issueId: null,
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function threadsOf(row: ThreadRecord | undefined): ThreadRepositoryPort {
  const port: Pick<ThreadRepositoryPort, 'findById'> = { findById: () => row };
  return port as ThreadRepositoryPort;
}

function agentsOf(row: AgentRecord): AgentRegistryPort {
  const port: Pick<AgentRegistryPort, 'findById'> = { findById: () => row };
  return port as AgentRegistryPort;
}

function sourcesOf(): SourceRegistryPort {
  const port: Pick<SourceRegistryPort, 'findById'> = {
    findById: (_orgId, sourceId) =>
      sourceId === 'src-1'
        ? {
            id: sourceId,
            orgId: ORG,
            name: 'src',
            description: null,
            distribution: { kind: 'host-bound', hostId: 'host-1' },
            uiVisibility: 'org',
            managed: false,
            vcs: null,
            availability: { hostIds: [] },
            lspJson: null,
            createdAt: NOW,
            updatedAt: NOW,
          }
        : null,
  };
  return port as SourceRegistryPort;
}

function worktreesOf(row: RepositoryWorktree | null): RepositoryWorktreePort {
  const port: Pick<RepositoryWorktreePort, 'findById'> = { findById: () => row };
  return port as RepositoryWorktreePort;
}

function layout(): HostFsLayoutPort {
  const port: Pick<HostFsLayoutPort, 'orgDataDir' | 'orgDir'> = {
    orgDataDir: (orgId) => `/data/orgs/${orgId}`,
    orgDir: (orgId) => `/orgs/${orgId}`,
  };
  return port as HostFsLayoutPort;
}

function deps(
  threadRecord: ThreadRecord,
  agentRecord: AgentRecord,
  worktrees: RepositoryWorktreePort = worktreesOf(null),
): ResolveRunEnvironmentDeps {
  return {
    orgId: ORG,
    threads: threadsOf(threadRecord),
    agents: agentsOf(agentRecord),
    sources: sourcesOf(),
    worktrees,
    layout: layout(),
    localHostId: 'host-1',
  };
}

describe('resolveRunEnvironment', () => {
  test('rejects a worktree that is not ready', () => {
    expect(() =>
      resolveRunEnvironment(deps(thread(null), agent(), worktreesOf(worktree('creating'))), {
        threadId: 'thread-1',
        agentId: 'agent-1',
        explicit: { kind: 'worktree', sourceId: 'src-1', worktreeId: 'wt-1' },
        issue: false,
      }),
    ).toThrow('worktree wt-1 is not ready');
  });

  test('passes provenance through from the thread layer', () => {
    const environment = resolveRunEnvironment(deps(thread({ kind: 'sandbox' }), agent()), {
      threadId: 'thread-1',
      agentId: 'agent-1',
      issue: false,
    });
    expect(environment.provenance).toBe('thread');
    expect(environment.anchor).toBeNull();
    expect(environment.cwd).toBe('sandbox');
  });

  test('an issue thread without a ref falls back to the agent default', () => {
    const environment = resolveRunEnvironment(
      deps(thread(null), agent({ defaultWorkspaceRef: { kind: 'source', sourceId: 'src-1' } })),
      { threadId: 'thread-1', agentId: 'agent-1', issue: false },
    );
    expect(environment.provenance).toBe('agent');
    expect(environment.anchor).toEqual({ kind: 'source', sourceId: 'src-1' });
    expect(environment.cwd).toBe('anchor');
  });

  test('rejects a folder inside a protected root', () => {
    expect(() =>
      resolveRunEnvironment(deps(thread(null), agent()), {
        threadId: 'thread-1',
        agentId: 'agent-1',
        explicit: { kind: 'folder', path: '/orgs/org-1/org.db' },
        issue: false,
      }),
    ).toThrow('workspace folder must be outside protected roots');
  });

  test('composes a same-source subpath across run and thread layers', () => {
    const environment = resolveRunEnvironment(
      deps(thread({ kind: 'source', sourceId: 'src-1', subpath: 'apps/web' }), agent()),
      {
        threadId: 'thread-1',
        agentId: 'agent-1',
        explicit: { kind: 'source', sourceId: 'src-1' },
        issue: false,
        branch: 'feat/x',
      },
    );
    expect(environment.anchor).toEqual({ kind: 'source', sourceId: 'src-1' });
    expect(environment.subpath).toBe('apps/web');
    expect(environment.branch).toBe('feat/x');
    expect(environment.provenance).toBe('run');
  });
});
