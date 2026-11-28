import { describe, expect, test } from 'bun:test';
import { Logger } from '@harnesys/brix';
import type { UpdateIssueStatusBody } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import type { BoardRuleRecord, IssueBoardRecord } from '../../domain/issue/board.ts';
import type { IssueDependencyRecord, IssueRecord } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import {
  MemoryAgents,
  MemoryBoards,
  MemoryIssues,
  MemoryLabels,
  MemorySources,
  StubProfiles,
} from './create-issue.use-case.fakes.ts';
import {
  createDriver,
  createLayout,
  createMaterializations,
  createWorktrees,
  MemoryIssueExecutions,
  StubCreateIssueWorktree,
  StubEvents,
  StubIssueFire,
  StubMachineConfig,
  StubWake,
} from './create-issue.use-case.work-fakes.ts';
import { UpdateIssueStatusUseCase } from './update-issue-status.use-case.ts';

const NOW = new Date(0).toISOString();
const ORG_ID = 'org-1';

function boardRecord(rules: BoardRuleRecord[] = []): IssueBoardRecord {
  return {
    id: 'board-1',
    orgId: ORG_ID,
    name: 'Board',
    description: '',
    color: '#000000',
    icon: 'box',
    status: 'active',
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    statuses: [
      { key: 'backlog', label: 'Backlog', category: 'backlog', order: 0, isEntry: true },
      { key: 'todo', label: 'Todo', category: 'started', order: 1, isEntry: false },
      { key: 'in_progress', label: 'In Progress', category: 'started', order: 2, isEntry: false },
      { key: 'done', label: 'Done', category: 'finished', order: 3, isEntry: false },
    ],
    rules,
  };
}

function agentRecord(): AgentRecord {
  return {
    id: 'agent-1',
    orgId: ORG_ID,
    name: 'Coder',
    role: 'coder',
    instructions: '',
    modelId: 'model-a',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    departmentId: null,
    executionProfileId: null,
    status: 'active',
    acl: [],
    sharedSourceIds: [],
    sourceLevels: {},
    secretNames: [],
    skills: [],
    mcpServers: [],
    enabledPlugins: {},
    defaultModeId: null,
    defaultRunDirectory: null,
    config: {},
    hooks: [],
    createdAt: NOW,
    updatedAt: NOW,
  } as AgentRecord;
}

function issueRecord(id: string, title: string, statusKey: string): IssueRecord {
  return {
    id,
    orgId: ORG_ID,
    boardId: 'board-1',
    title,
    description: '',
    statusKey,
    priority: 3,
    type: 'task',
    assigneeAgentId: null,
    labels: [],
    parentIssueId: null,
    dueDate: null,
    closedAt: null,
    fireTrail: [],
    sourceId: null,
    workspaceSubpath: null,
    branch: null,
    worktreeOnStatus: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class MemoryDependencyRows extends IssueDependencyRepositoryPort {
  constructor(private readonly rows: IssueDependencyRecord[]) {
    super();
  }

  listByIssue(): [] {
    return [];
  }

  listDependents(): [] {
    return [];
  }

  listAll(): IssueDependencyRecord[] {
    return this.rows;
  }

  insert(): never {
    throw new Error('not used');
  }

  delete(): void {}
}

class SilentLogger extends Logger {
  child(): Logger {
    return this;
  }

  info(): void {}

  debug(): void {}

  warn(): void {}

  error(): void {}
}

function buildHarness(parts: {
  issues: IssueRecord[];
  dependencies: IssueDependencyRecord[];
  rules?: BoardRuleRecord[];
}) {
  const issues = new MemoryIssues();
  for (const record of parts.issues) {
    issues.insert(record);
  }
  const fire = new StubIssueFire();
  const contentProxy: FleetContentProxyPort = {
    requestProxy: () => Promise.reject(new Error('not used')),
  };
  const useCase = new UpdateIssueStatusUseCase(
    issues,
    new MemoryBoards(boardRecord(parts.rules ?? [])),
    new MemoryAgents(agentRecord()),
    new StubProfiles(),
    new MemoryDependencyRows(parts.dependencies),
    new MemoryLabels(),
    new MemoryIssueExecutions(),
    fire,
    new StubEvents(),
    new StubWake(),
    createWorktrees(),
    new StubMachineConfig(),
    createLayout(),
    createDriver(),
    contentProxy,
    new StubCreateIssueWorktree(),
    new MemorySources(null),
    createMaterializations(),
    new SilentLogger(),
  );
  return { useCase, fire };
}

function blockerDependency(): IssueDependencyRecord {
  return {
    orgId: ORG_ID,
    issueId: 'issue-1',
    dependsOnIssueId: 'issue-2',
    type: 'blocks',
    createdAt: NOW,
  };
}

function openIssues(): IssueRecord[] {
  return [
    issueRecord('issue-1', 'Fix the loop', 'backlog'),
    issueRecord('issue-2', 'Wait for API', 'backlog'),
  ];
}

function moveBody(partial: Partial<UpdateIssueStatusBody>): UpdateIssueStatusBody {
  return { statusKey: 'in_progress', ...partial };
}

describe('UpdateIssueStatusUseCase unknown statusKey', () => {
  test('move fails with the invalid key, the board keys and issue_board_list guidance', () => {
    const { useCase } = buildHarness({ issues: openIssues(), dependencies: [] });

    expect(
      useCase.execute({
        orgId: ORG_ID,
        issueId: 'issue-1',
        body: moveBody({ statusKey: 'no_such_status' }),
      }),
    ).rejects.toThrow(
      'unknown statusKey: no_such_status (board statuses: backlog, todo, in_progress, done; see issue_board_list)',
    );
  });
});

describe('UpdateIssueStatusUseCase fire suppression', () => {
  test('open blockers suppress an explicit assignee and the result names the blockers', async () => {
    const { useCase, fire } = buildHarness({
      issues: openIssues(),
      dependencies: [blockerDependency()],
    });

    const result = await useCase.execute({
      orgId: ORG_ID,
      issueId: 'issue-1',
      body: moveBody({ assigneeAgentId: 'agent-1' }),
    });

    expect(result.statusKey).toBe('in_progress');
    expect(result.assigneeAgentId).toBe('agent-1');
    expect(result.fireSuppressed?.blockers).toEqual([{ id: 'issue-2', title: 'Wait for API' }]);
    expect(result.fireSuppressed?.message).toContain('no agent was fired');
    expect(fire.requests).toHaveLength(0);
  });

  test('open blockers suppress a rule assignment and the result names the blockers', async () => {
    const { useCase, fire } = buildHarness({
      issues: openIssues(),
      dependencies: [blockerDependency()],
      rules: [
        {
          id: 'rule-1',
          trigger: { type: 'status_entered', statusKey: 'in_progress' },
          conditions: [],
          actions: [{ type: 'assign_agent', agentId: 'agent-1' }],
          position: 0,
          enabled: true,
          createdByUserId: null,
        },
      ],
    });

    const result = await useCase.execute({
      orgId: ORG_ID,
      issueId: 'issue-1',
      body: moveBody({}),
    });

    expect(result.statusKey).toBe('in_progress');
    expect(result.fireSuppressed?.blockers).toEqual([{ id: 'issue-2', title: 'Wait for API' }]);
    expect(fire.requests).toHaveLength(0);
  });

  test('a clean move carries no fireSuppressed field', async () => {
    const { useCase } = buildHarness({ issues: openIssues(), dependencies: [] });

    const result = await useCase.execute({
      orgId: ORG_ID,
      issueId: 'issue-1',
      body: moveBody({}),
    });

    expect(result.statusKey).toBe('in_progress');
    expect(result.fireSuppressed).toBeUndefined();
  });
});
