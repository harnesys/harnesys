import type { RepositoryWorktree } from '@harnesys/contracts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { ReserveIssueExecutionInput } from '../../domain/issue/issue-execution.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution } from '../../domain/issue/issue-execution.ts';
import {
  IssueFirePort,
  type IssueFireRequest,
  type IssueFireResult,
} from '../../domain/issue/issue-fire.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import type { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { CreateIssueWorktreeRequest } from './create-issue-worktree.use-case.ts';
import { CreateIssueWorktreeUseCase } from './create-issue-worktree.use-case.ts';

export class MemoryIssueExecutions extends IssueExecutionPort {
  readonly rows = new Map<string, IssueExecution>();

  single(): IssueExecution | null {
    const row = this.rows.values().next().value;
    return row ? { ...row } : null;
  }

  findById(): never {
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

  findByCorrelationId(): never {
    throw new Error('not used');
  }

  findByRunId(): never {
    throw new Error('not used');
  }

  listActive(): never {
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

  setState(): never {
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

  releaseByRunId(): never {
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

export class StubEvents extends IssueEventsPort {
  readonly emitted: string[] = [];

  subscribe(): () => void {
    throw new Error('not used');
  }

  emit(orgId: string): void {
    this.emitted.push(orgId);
  }
}

export class StubMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'host-1', name: 'local', listen: '127.0.0.1:0', token: 't' };
  }

  set(): void {}
}

export class StubCreateIssueWorktree extends CreateIssueWorktreeUseCase {
  readonly calls: Array<{ orgId: string; issueId: string }> = [];
  result: { id: string } | null = { id: 'wt-new' };

  constructor() {
    super(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );
  }

  override async execute(request: CreateIssueWorktreeRequest): Promise<RepositoryWorktree> {
    this.calls.push({ orgId: request.orgId, issueId: request.issueId });
    if (!this.result) {
      throw new Error('no ready host');
    }
    return { id: this.result.id } as RepositoryWorktree;
  }
}

export function createLayout(): HostFsLayoutPort {
  const layout: Pick<HostFsLayoutPort, 'orgSourceDir' | 'sourceWorktreesDir'> = {
    orgSourceDir: () => '/org/src',
    sourceWorktreesDir: () => '/org/wt',
  };
  return layout as HostFsLayoutPort;
}

export function createDriver(): SourceDriverPort {
  const driver: Pick<SourceDriverPort, 'kind' | 'observeWorktree'> = {
    kind: 'git',
    observeWorktree: () =>
      Promise.resolve({ dirty: false, unpushed: false, branch: 'issue/1', head: null }),
  };
  return driver as SourceDriverPort;
}

export function createWorktrees(): RepositoryWorktreePort {
  const port: Pick<RepositoryWorktreePort, 'listForIssue' | 'findActiveByBranch'> = {
    listForIssue: () => [],
    findActiveByBranch: () => null,
  };
  return port as RepositoryWorktreePort;
}

export function createMaterializations(): SourceMaterializationPort {
  const port: Pick<SourceMaterializationPort, 'find'> = { find: () => null };
  return port as SourceMaterializationPort;
}
