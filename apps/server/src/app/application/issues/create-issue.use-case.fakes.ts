import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import type { IssueInsert, IssuePatch, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import type { IssueLabelRecord } from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { type SourceRecord, SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export class MemoryIssues extends IssueRepositoryPort {
  readonly rows = new Map<string, IssueRecord>();

  listByOrg(): never {
    throw new Error('not used');
  }

  findById(orgId: string, id: string): IssueRecord | undefined {
    const row = this.rows.get(id);
    return row && row.orgId === orgId ? { ...row } : undefined;
  }

  listChildren(): never {
    throw new Error('not used');
  }

  insert(rec: IssueInsert): IssueRecord {
    this.rows.set(rec.id, { ...rec });
    return { ...rec };
  }

  update(orgId: string, id: string, patch: IssuePatch): IssueRecord {
    const row = this.rows.get(id);
    if (!row || row.orgId !== orgId) {
      throw new Error(`issue not found: ${id}`);
    }
    const next = { ...row, ...patch };
    this.rows.set(id, next);
    return { ...next };
  }

  delete(): void {}

  clearLabelFromAll(): void {}
}

export class MemoryBoards extends IssueBoardRepositoryPort {
  constructor(private readonly board: IssueBoardRecord) {
    super();
  }

  listByOrg(): never {
    throw new Error('not used');
  }

  findById(orgId: string, id: string): IssueBoardRecord | undefined {
    return this.board.orgId === orgId && this.board.id === id ? this.board : undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {}

  addStatus(): never {
    throw new Error('not used');
  }

  updateStatus(): never {
    throw new Error('not used');
  }

  removeStatus(): void {}

  reorderStatuses(): void {}

  saveRule(): never {
    throw new Error('not used');
  }

  removeRule(): void {}

  reorderRules(): void {}
}

export class MemoryDependencies extends IssueDependencyRepositoryPort {
  listByIssue(): [] {
    return [];
  }

  listDependents(): [] {
    return [];
  }

  listAll(): [] {
    return [];
  }

  insert(): never {
    throw new Error('not used');
  }

  delete(): void {}
}

export class MemoryAgents extends AgentRegistryPort {
  constructor(private readonly agent: AgentRecord) {
    super();
  }

  list(): never {
    throw new Error('not used');
  }

  findById(_orgId: string, id: string): AgentRecord | undefined {
    return this.agent.id === id ? this.agent : undefined;
  }

  findByName(): undefined {
    return undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {}
}

export class MemoryLabels extends IssueLabelRepositoryPort {
  constructor(private readonly labels: IssueLabelRecord[] = []) {
    super();
  }

  listByOrg(orgId: string): IssueLabelRecord[] {
    return this.labels.filter((label) => label.orgId === orgId);
  }

  findById(orgId: string, id: string): IssueLabelRecord | undefined {
    return this.labels.find((label) => label.orgId === orgId && label.id === id);
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  delete(): void {}
}

export class MemorySources extends SourceRegistryPort {
  constructor(private readonly source: SourceRecord | null) {
    super();
  }

  list(): never {
    throw new Error('not used');
  }

  findById(): SourceRecord | null {
    return this.source;
  }

  findManagedWorkspace(): null {
    return null;
  }

  insert(): void {}

  updateVisibility(): void {}

  updateName(): void {}

  updateDistribution(): void {}

  updateVcs(): void {}

  updateAvailability(): void {}

  updateLspJson(): void {}

  remove(): void {}
}

export class StubProfiles extends ExecutionProfilePort {
  list(): [] {
    return [];
  }

  findById(): undefined {
    return undefined;
  }

  findByName(): undefined {
    return undefined;
  }

  insert(): never {
    throw new Error('not used');
  }

  update(): never {
    throw new Error('not used');
  }

  setNodes(): never {
    throw new Error('not used');
  }

  removeNodeFromAll(): void {}

  getDefault(): undefined {
    return undefined;
  }

  setDefault(): void {}

  delete(): void {}

  ensureLocalDefault(): never {
    throw new Error('not used');
  }

  countUsage(): never {
    throw new Error('not used');
  }
}
