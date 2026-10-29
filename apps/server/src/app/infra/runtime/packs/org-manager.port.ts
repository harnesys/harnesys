import type {
  CapabilityScope,
  ManagerPulse,
  ManagerThreadTailItem,
  ManagerUsageQuery,
  ManagerUsageReport,
  ManagerUsageRow,
} from 'harnesys';
import { ManagerObservationPort } from 'harnesys';
import { AgentRegistryPort } from '../../../domain/agent/agent-registry.port.ts';
import { ApprovalStorePort } from '../../../domain/approval/approval-store.port.ts';
import type { IssueBoardRecord } from '../../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../../domain/issue/board-repository.port.ts';
import { IssueRepositoryPort } from '../../../domain/issue/issue-repository.port.ts';
import { ManagerTailPort } from '../../../domain/manager/manager-tail.port.ts';
import { buildPulse } from '../../../domain/manager/pulse-math.ts';
import { OrgSettingsPort } from '../../../domain/skills/org-settings.port.ts';
import { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import { localDayRange } from '../../../domain/usage/daily-budget.ts';
import { UsagePort } from '../../../domain/usage/usage-port.ts';

export interface OrgManagerDeps {
  agents: AgentRegistryPort;
  threads: ThreadRepositoryPort;
  usage: UsagePort;
  approvals: ApprovalStorePort;
  issues: IssueRepositoryPort;
  boards: IssueBoardRepositoryPort;
  tail: ManagerTailPort;
  orgSettings: OrgSettingsPort;
}

const TAIL_LIMIT_MAX = 100;

function closedStatusKeysByBoard(boards: IssueBoardRecord[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const board of boards) {
    map.set(
      board.id,
      new Set(
        board.statuses
          .filter((status) => status.category === 'finished' || status.category === 'cancelled')
          .map((status) => status.key),
      ),
    );
  }
  return map;
}

export class OrgManagerPort extends ManagerObservationPort {
  constructor(private readonly deps: OrgManagerDeps) {
    super();
  }

  pulse(scope: CapabilityScope): Promise<ManagerPulse> {
    const agents = this.deps.agents.list(scope.orgId);
    const threads = this.deps.threads.listByOrg(scope.orgId);
    const range = localDayRange(this.deps.orgSettings.get(scope.orgId).timezone, new Date());
    const spentByAgent = new Map(
      agents.map((agent) => [
        agent.id,
        this.deps.usage.sumAgentDayCostUsd(scope.orgId, agent.id, range.startIso, range.endIso),
      ]),
    );
    const pendingApprovals = this.deps.approvals.list(scope.orgId, { status: 'pending' }).length;
    const closedKeysByBoard = closedStatusKeysByBoard(this.deps.boards.listByOrg(scope.orgId));
    const openIssues = this.deps.issues
      .listByOrg(scope.orgId)
      .filter((issue) => !closedKeysByBoard.get(issue.boardId)?.has(issue.statusKey)).length;
    return Promise.resolve(
      buildPulse({ agents, threads, spentByAgent, pendingApprovals, openIssues, day: range.day }),
    );
  }

  usage(scope: CapabilityScope, query: ManagerUsageQuery): Promise<ManagerUsageReport> {
    const report = this.deps.usage.report(scope.orgId, {
      orgId: scope.orgId,
      timezone: this.deps.orgSettings.get(scope.orgId).timezone,
      ...(query.groupBy ? { groupBy: query.groupBy } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
    });
    const rows: ManagerUsageRow[] = report.rows.map((row) => ({
      key: row.key,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
      runs: row.runs,
    }));
    let totalRuns = 0;
    for (const row of rows) {
      totalRuns += row.runs;
    }
    return Promise.resolve({
      rows,
      totalCostUsd: report.totals.costUsd,
      totalRuns,
    });
  }

  threadTail(
    scope: CapabilityScope,
    threadId: string,
    limit: number,
  ): Promise<ManagerThreadTailItem[]> {
    const requested = Math.max(1, Math.min(limit, TAIL_LIMIT_MAX));
    return Promise.resolve(this.deps.tail.tail(scope.orgId, threadId, requested));
  }
}
