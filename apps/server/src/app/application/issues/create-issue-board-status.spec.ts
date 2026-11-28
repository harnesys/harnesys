import { describe, expect, test } from 'bun:test';
import { Logger } from '@harnesys/brix';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import type {
  IssueDependencyInsert,
  IssueDependencyRecord,
  IssueRecord,
} from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import {
  MemoryAgents,
  MemoryBoards,
  MemoryIssues,
  MemoryLabels,
  MemorySources,
  StubProfiles,
} from './create-issue.use-case.fakes.ts';
import { CreateIssueUseCase } from './create-issue.use-case.ts';
import {
  createDriver,
  createLayout,
  createMaterializations,
  createWorktrees,
  MemoryIssueExecutions,
  StubEvents,
  StubIssueFire,
  StubMachineConfig,
  StubWake,
} from './create-issue.use-case.work-fakes.ts';

const NOW = new Date(0).toISOString();
const ORG_ID = 'org-1';
const STATUS_MESSAGE =
  'unknown statusKey: no_such_status (board statuses: backlog, todo, in_progress, done; see issue_board_list)';

function boardRecord(): IssueBoardRecord {
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
    rules: [],
  };
}

function issueRecord(id: string, title: string): IssueRecord {
  return {
    id,
    orgId: ORG_ID,
    boardId: 'board-1',
    title,
    description: '',
    statusKey: 'backlog',
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
  readonly rows: IssueDependencyRecord[] = [];

  listByIssue(): [] {
    return [];
  }

  listDependents(): [] {
    return [];
  }

  listAll(): IssueDependencyRecord[] {
    return this.rows;
  }

  insert(rec: IssueDependencyInsert): IssueDependencyRecord {
    this.rows.push(rec);
    return { ...rec };
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

function buildUseCase(issues: MemoryIssues, dependencies: IssueDependencyRepositoryPort) {
  const fire = new StubIssueFire();
  const useCase = new CreateIssueUseCase(
    issues,
    new MemoryBoards(boardRecord()),
    dependencies,
    new MemoryAgents({
      id: 'agent-1',
      orgId: ORG_ID,
      name: 'Coder',
    } as AgentRecord),
    new MemoryLabels(),
    new MemoryIssueExecutions(),
    fire,
    new StubEvents(),
    new StubWake(),
    new MemorySources(null),
    new StubProfiles(),
    createWorktrees(),
    new StubMachineConfig(),
    createLayout(),
    createDriver(),
    createMaterializations(),
    new SilentLogger(),
  );
  return { useCase, fire };
}

describe('CreateIssueUseCase unknown statusKey', () => {
  test('create fails with the invalid key, the board keys and issue_board_list guidance', () => {
    const { useCase } = buildUseCase(new MemoryIssues(), new MemoryDependencyRows());

    expect(
      useCase.execute({
        orgId: ORG_ID,
        body: {
          boardId: 'board-1',
          title: 'Fix the loop',
          statusKey: 'no_such_status',
        },
      }),
    ).rejects.toThrow(STATUS_MESSAGE);
  });

  test('commit fails with the same guidance', () => {
    const issues = new MemoryIssues();
    issues.insert(issueRecord('draft-1', 'Draft'));
    const { useCase } = buildUseCase(issues, new MemoryDependencyRows());

    expect(
      useCase.commit({ orgId: ORG_ID, issueId: 'draft-1', statusKey: 'no_such_status' }),
    ).rejects.toThrow(STATUS_MESSAGE);
  });
});

describe('CreateIssueUseCase fire suppression', () => {
  test('creating in a started column with a blocked assignee reports fireSuppressed', async () => {
    const issues = new MemoryIssues();
    issues.insert(issueRecord('blocker-1', 'Wait for API'));
    const { useCase, fire } = buildUseCase(issues, new MemoryDependencyRows());

    const response = await useCase.execute({
      orgId: ORG_ID,
      body: {
        boardId: 'board-1',
        title: 'Fix the loop',
        statusKey: 'in_progress',
        assigneeAgentId: 'agent-1',
        dependencies: [{ dependsOnIssueId: 'blocker-1' }],
      },
    });

    expect(response.issue.statusKey).toBe('in_progress');
    expect(response.issue.assigneeAgentId).toBe('agent-1');
    expect(response.fireSuppressed?.blockers).toEqual([{ id: 'blocker-1', title: 'Wait for API' }]);
    expect(response.fireSuppressed?.message).toContain('no agent was fired');
    expect(fire.requests).toHaveLength(0);
  });
});
