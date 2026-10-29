import type { IssueRecord } from '../../domain/issue/issue.ts';
import { type IssueDomainEvent, IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { ReserveIssueExecutionInput } from '../../domain/issue/issue-execution.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution } from '../../domain/issue/issue-execution.ts';
import {
  IssueFirePort,
  type IssueFireRequest,
  type IssueFireResult,
} from '../../domain/issue/issue-fire.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { RepositoryWorktree } from '../../domain/source/repository-worktree.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export const NOW = new Date(0).toISOString();

export class MemoryIssueExecutions extends IssueExecutionPort {
  readonly rows = new Map<string, IssueExecution>();

  single(): IssueExecution | null {
    const row = this.rows.values().next().value;
    return row ? { ...row } : null;
  }

  findById(): IssueExecution | null {
    throw new Error('not used');
  }

  findActiveByIssue(orgId: string, issueId: string): IssueExecution | null {
    for (const row of this.rows.values()) {
      if (row.orgId === orgId && row.issueId === issueId && row.state !== 'released') {
        return { ...row };
      }
    }
    return null;
  }

  findByCorrelationId(): IssueExecution | null {
    throw new Error('not used');
  }

  findByRunId(): IssueExecution | null {
    throw new Error('not used');
  }

  listActive(): IssueExecution[] {
    throw new Error('not used');
  }

  reserve(input: ReserveIssueExecutionInput): IssueExecution {
    const row: IssueExecution = {
      id: input.id,
      orgId: input.orgId,
      issueId: input.issueId,
      runId: null,
      agentId: input.agentId,
      worktreeId: input.worktreeId ?? null,
      correlationId: input.correlationId,
      leaseEpoch: 0,
      state: 'reserved',
      requestedStatus: input.requestedStatus,
      ruleId: input.ruleId ?? null,
      profileId: input.profileId ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  setWorktree(
    orgId: string,
    id: string,
    worktreeId: string,
    updatedAt: string,
  ): IssueExecution | null {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) {
      return null;
    }
    row.worktreeId = worktreeId;
    row.updatedAt = updatedAt;
    return { ...row };
  }

  activate(orgId: string, id: string, runId: string, updatedAt: string): IssueExecution | null {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) {
      return null;
    }
    row.runId = runId;
    row.state = 'active';
    row.updatedAt = updatedAt;
    return { ...row };
  }

  setState(): IssueExecution | null {
    throw new Error('not used');
  }

  release(orgId: string, id: string, updatedAt: string): IssueExecution | null {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) {
      return null;
    }
    row.state = 'released';
    row.updatedAt = updatedAt;
    return { ...row };
  }

  releaseByRunId(): IssueExecution | null {
    throw new Error('not used');
  }
}

export class StubIssueFire extends IssueFirePort {
  readonly requests: IssueFireRequest[] = [];
  result: IssueFireResult = { outcome: 'fired', runId: 'run-1' };

  async fire(request: IssueFireRequest): Promise<IssueFireResult> {
    this.requests.push(request);
    return this.result;
  }
}

export class RecordingEvents extends IssueEventsPort {
  readonly notifications: string[] = [];

  emit(_orgId: string, event: IssueDomainEvent): void {
    if (event.type === 'rule-notification') {
      this.notifications.push(event.text);
    }
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

export class StubMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'host-1', name: 'local', listen: '127.0.0.1:0', token: 't' };
  }

  set(): void {}
}

export function createLayout(): HostFsLayoutPort {
  const layout: Pick<HostFsLayoutPort, 'orgSourceDir' | 'sourceWorktreesDir'> = {
    orgSourceDir: () => '/org/src',
    sourceWorktreesDir: () => '/org/wt',
  };
  return layout as HostFsLayoutPort;
}

export function createDriver(checkoutBranch: string | null): SourceDriverPort {
  const driver: Pick<SourceDriverPort, 'kind' | 'observeWorktree'> = {
    kind: 'git',
    observeWorktree: () =>
      Promise.resolve({ dirty: false, unpushed: false, branch: checkoutBranch, head: null }),
  };
  return driver as SourceDriverPort;
}

export function sourceRecord(id: string): SourceRecord {
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

export function createSources(byId: SourceRecord | null): SourceRegistryPort {
  const port: Pick<SourceRegistryPort, 'findById' | 'findManagedWorkspace'> = {
    findById: (_orgId, sourceId) => (byId?.id === sourceId ? byId : null),
    findManagedWorkspace: () => null,
  };
  return port as SourceRegistryPort;
}

export function createMaterializations(): SourceMaterializationPort {
  const port: Pick<SourceMaterializationPort, 'find'> = {
    find: () => ({
      orgId: 'org-1',
      sourceId: 'src-1',
      hostId: 'host-1',
      origin: 'managed',
      localPath: '/org/wt/checkout',
      state: 'ready',
      revision: 1,
      updatedAt: NOW,
      lastError: null,
      lastConflictPaths: [],
      refreshRequired: false,
    }),
  };
  return port as SourceMaterializationPort;
}

export function createWorktrees(active: RepositoryWorktree | null): RepositoryWorktreePort {
  const port: Pick<RepositoryWorktreePort, 'findActiveByBranch'> = {
    findActiveByBranch: () => active,
  };
  return port as RepositoryWorktreePort;
}

export function createIssues(rows: IssueRecord[]): IssueRepositoryPort {
  const port: Pick<IssueRepositoryPort, 'listByOrg'> = {
    listByOrg: () => rows,
  };
  return port as IssueRepositoryPort;
}

export function issueRecord(parts: Partial<IssueRecord> = {}): IssueRecord {
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

export function worktreeRecord(): RepositoryWorktree {
  return {
    id: 'wt-1',
    orgId: 'org-1',
    sourceId: 'src-1',
    hostId: 'host-1',
    branch: 'main',
    baseCommit: null,
    state: 'ready',
    activeRunId: null,
    operationId: 'op-1',
    issueId: 'issue-1',
    lastErrorCode: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
