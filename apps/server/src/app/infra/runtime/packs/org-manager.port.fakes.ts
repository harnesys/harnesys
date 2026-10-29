import type { OrgSettings } from '@harnesys/contracts';
import { OrgSettingsSchema } from '@harnesys/contracts';
import type { ManagerThreadTailItem } from 'harnesys';
import type { ApprovalListFilter, ApprovalRecord } from '../../../domain/approval/approval.ts';
import { ApprovalStorePort } from '../../../domain/approval/approval-store.port.ts';
import type {
  BoardRuleRecord,
  BoardStatus,
  IssueBoardRecord,
} from '../../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../../domain/issue/board-repository.port.ts';
import type { IssueInsert, IssueRecord } from '../../../domain/issue/issue.ts';
import { IssueRepositoryPort } from '../../../domain/issue/issue-repository.port.ts';
import { ManagerTailPort } from '../../../domain/manager/manager-tail.port.ts';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import type {
  NewUsageRecord,
  UsageReport,
  UsageRunsReport,
} from '../../../domain/usage/usage-port.ts';
import { UsagePort } from '../../../domain/usage/usage-port.ts';
import { OrgManagerPort } from './org-manager.port.ts';
import { MemoryAgents, MemoryThreads } from './wire-org-packs.fakes.ts';

export class FakeUsage extends UsagePort {
  spendByAgent = new Map<string, number>();
  reportResult: UsageReport = emptyReport();
  dayRanges: Array<{ agentId: string; fromIso: string; toIso: string }> = [];

  report(_orgId: string, _request: { groupBy?: string }): UsageReport {
    return this.reportResult;
  }
  record(_orgId: string, _record: NewUsageRecord): void {}
  sumRunTokens(_orgId: string, _runId: string): number {
    return 0;
  }
  sumCostUsdByRunIds(_orgId: string, _runIds: string[]): number {
    return 0;
  }
  sumAgentDayCostUsd(_orgId: string, agentId: string, fromIso: string, toIso: string): number {
    this.dayRanges.push({ agentId, fromIso, toIso });
    return this.spendByAgent.get(agentId) ?? 0;
  }
  runsReport(): UsageRunsReport {
    return { rows: [], totals: { inputTokens: 0, outputTokens: 0, costUsd: 0, runs: 0 } };
  }
  getPriceOverride(): null {
    return null;
  }
  listPriceOverrides(): [] {
    return [];
  }
  setPriceOverride(): void {}
  deletePriceOverride(): boolean {
    return false;
  }
  markBudgetMark(): boolean {
    return false;
  }
}

export function emptyReport(): UsageReport {
  return {
    rows: [],
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
    },
    byMember: [],
  };
}

export class FakeApprovals extends ApprovalStorePort {
  pendingCount = 0;

  list(_orgId: string, filter?: ApprovalListFilter): ApprovalRecord[] {
    if (filter?.status === 'pending') {
      return Array.from({ length: this.pendingCount }, () => ({}) as ApprovalRecord);
    }
    return [];
  }
  request(): { id: string } {
    return { id: 'a' };
  }
  decide(): {
    winner: boolean;
    status: 'denied' | 'pending' | 'approved' | 'cancelled' | 'superseded';
  } {
    throw new Error('not implemented');
  }
  get(): null {
    return null;
  }
  getByRunInterrupt(): null {
    return null;
  }
  markRunCancelled(): [] {
    return [];
  }

  listResumable(): [] {
    return [];
  }

  markResumeApplied(): null {
    return null;
  }

  markResumeCancelled(): null {
    return null;
  }
}

export class FakeIssues extends IssueRepositoryPort {
  rows: IssueRecord[] = [];

  listByOrg(_orgId: string): IssueRecord[] {
    return this.rows;
  }
  findById(): undefined {
    return undefined;
  }
  listChildren(): IssueRecord[] {
    return [];
  }
  insert(rec: IssueInsert): IssueRecord {
    this.rows.push(rec);
    return rec;
  }
  update(_orgId: string, _id: string, patch: Partial<IssueRecord>): IssueRecord {
    throw new Error(`not implemented: ${JSON.stringify(patch)}`);
  }
  delete(): void {}
  clearLabelFromAll(): void {}
}

export class FakeBoards extends IssueBoardRepositoryPort {
  rows: IssueBoardRecord[] = [];

  listByOrg(_orgId: string): IssueBoardRecord[] {
    return this.rows;
  }
  findById(): IssueBoardRecord | undefined {
    return undefined;
  }
  insert(rec: IssueBoardRecord): IssueBoardRecord {
    this.rows.push(rec);
    return rec;
  }
  update(): IssueBoardRecord {
    throw new Error('not implemented');
  }
  delete(): void {}
  addStatus(): BoardStatus {
    throw new Error('not implemented');
  }
  updateStatus(): BoardStatus {
    throw new Error('not implemented');
  }
  removeStatus(): void {}
  reorderStatuses(): void {}
  saveRule(): BoardRuleRecord {
    throw new Error('not implemented');
  }
  removeRule(): void {}
  reorderRules(): void {}
}

export class FakeTail extends ManagerTailPort {
  calls: Array<{ orgId: string; threadId: string; limit: number }> = [];

  tail(orgId: string, threadId: string, limit: number): ManagerThreadTailItem[] {
    this.calls.push({ orgId, threadId, limit });
    return [
      { seq: 2, runId: 'r1', kind: 'text-delta', at: '2026-10-18T12:00:02.000Z', preview: 'b' },
      { seq: 1, runId: 'r1', kind: 'user', at: '2026-10-18T12:00:01.000Z', preview: 'a' },
    ];
  }
}

export class FakeOrgSettings extends OrgSettingsPort {
  timezone = 'UTC';

  get(): OrgSettings {
    return OrgSettingsSchema.parse({ timezone: this.timezone });
  }

  set(_orgId: string, patch: Partial<OrgSettings>): OrgSettings {
    return OrgSettingsSchema.parse(patch);
  }
}

export function managerPort(parts?: {
  agents?: MemoryAgents;
  threads?: MemoryThreads;
  usage?: FakeUsage;
  approvals?: FakeApprovals;
  issues?: FakeIssues;
  boards?: FakeBoards;
  tail?: FakeTail;
  orgSettings?: FakeOrgSettings;
}): {
  port: OrgManagerPort;
  agents: MemoryAgents;
  threads: MemoryThreads;
  usage: FakeUsage;
  approvals: FakeApprovals;
  issues: FakeIssues;
  boards: FakeBoards;
  tail: FakeTail;
  orgSettings: FakeOrgSettings;
} {
  const agents = parts?.agents ?? new MemoryAgents();
  const threads = parts?.threads ?? new MemoryThreads();
  const usage = parts?.usage ?? new FakeUsage();
  const approvals = parts?.approvals ?? new FakeApprovals();
  const issues = parts?.issues ?? new FakeIssues();
  const boards = parts?.boards ?? new FakeBoards();
  const tail = parts?.tail ?? new FakeTail();
  const orgSettings = parts?.orgSettings ?? new FakeOrgSettings();
  const port = new OrgManagerPort({
    agents,
    threads,
    usage,
    approvals,
    issues,
    boards,
    tail,
    orgSettings,
  });
  return { port, agents, threads, usage, approvals, issues, boards, tail, orgSettings };
}
