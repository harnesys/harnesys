import { describe, expect, test } from 'bun:test';
import type { UpdateIssueBody } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import type { IssueLabelRecord } from '../../domain/issue/label.ts';
import {
  MemoryAgents,
  MemoryBoards,
  MemoryIssues,
  MemoryLabels,
  MemorySources,
} from './create-issue.use-case.fakes.ts';
import {
  createLayout,
  createWorktrees,
  MemoryIssueExecutions,
  StubEvents,
  StubIssueFire,
  StubMachineConfig,
} from './create-issue.use-case.work-fakes.ts';
import { UpdateIssueUseCase } from './update-issue.use-case.ts';

const NOW = new Date(0).toISOString();
const ORG_ID = 'org-1';

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
      { key: 'done', label: 'Done', category: 'finished', order: 1, isEntry: false },
    ],
    rules: [],
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
    config: {},
    hooks: [],
    createdAt: NOW,
    updatedAt: NOW,
  } as AgentRecord;
}

function labelRecord(partial: Partial<IssueLabelRecord>): IssueLabelRecord {
  return {
    id: 'label-1',
    orgId: ORG_ID,
    title: 'backend',
    color: '#33aa33',
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function issueRecord(): IssueRecord {
  return {
    id: 'issue-1',
    orgId: ORG_ID,
    boardId: 'board-1',
    title: 'Fix the loop',
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
    branch: null,
    worktreeOnStatus: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function updateBody(partial: Partial<UpdateIssueBody>): UpdateIssueBody {
  return { ...partial };
}

function buildHarness(labels: MemoryLabels): {
  useCase: UpdateIssueUseCase;
  issues: MemoryIssues;
} {
  const issues = new MemoryIssues();
  issues.insert(issueRecord());
  const useCase = new UpdateIssueUseCase(
    issues,
    new MemoryBoards(boardRecord()),
    new MemoryAgents(agentRecord()),
    labels,
    new MemoryIssueExecutions(),
    new StubIssueFire(),
    new StubEvents(),
    new MemorySources(null),
    createWorktrees(),
    new StubMachineConfig(),
    createLayout(),
  );
  return { useCase, issues };
}

describe('UpdateIssueUseCase label resolution', () => {
  test('label title resolves to the label id on the stored record', () => {
    const { useCase, issues } = buildHarness(new MemoryLabels([labelRecord({})]));

    const issue = useCase.execute({
      orgId: ORG_ID,
      issueId: 'issue-1',
      body: updateBody({ labels: ['backend'] }),
    });

    expect(issue.labels).toEqual(['label-1']);
    expect(issues.rows.get('issue-1')?.labels).toEqual(['label-1']);
  });

  test('label id keeps working', () => {
    const { useCase } = buildHarness(new MemoryLabels([labelRecord({})]));

    const issue = useCase.execute({
      orgId: ORG_ID,
      issueId: 'issue-1',
      body: updateBody({ labels: ['label-1'] }),
    });

    expect(issue.labels).toEqual(['label-1']);
  });

  test('unknown label fails with guidance to create it first', () => {
    const { useCase } = buildHarness(new MemoryLabels([labelRecord({})]));

    expect(() =>
      useCase.execute({
        orgId: ORG_ID,
        issueId: 'issue-1',
        body: updateBody({ labels: ['nope'] }),
      }),
    ).toThrow(
      'unknown label: nope (no label with this id or title; create it first with label_create)',
    );
  });
});
