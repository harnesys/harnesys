import { describe, expect, test } from 'bun:test';
import { Logger } from '@harnesys/brix';
import type { CreateIssueBody } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import type { IssueLabelRecord } from '../../domain/issue/label.ts';
import { type SourceRecord } from '../../domain/source/source-registry.port.ts';
import {
  MemoryAgents,
  MemoryBoards,
  MemoryDependencies,
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
} from './create-issue.use-case.work-fakes.ts';

const NOW = new Date(0).toISOString();
const ORG_ID = 'org-1';
const SOURCE_ID = 'src-1';

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

function sourceRecord(): SourceRecord {
  return {
    id: SOURCE_ID,
    orgId: ORG_ID,
    name: 'Workspace',
    description: null,
    distribution: { kind: 'host-bound', hostId: 'host-1' },
    uiVisibility: 'host',
    managed: true,
    vcs: null,
    availability: { hostIds: [] },
    lspJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
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

class SilentLogger extends Logger {
  child(): Logger {
    return this;
  }

  info(): void {}

  debug(): void {}

  warn(): void {}

  error(): void {}
}

function buildUseCase(parts: {
  fire: StubIssueFire;
  executions: MemoryIssueExecutions;
  source: SourceRecord | null;
  labels?: MemoryLabels;
}): CreateIssueUseCase {
  return new CreateIssueUseCase(
    new MemoryIssues(),
    new MemoryBoards(boardRecord()),
    new MemoryDependencies(),
    new MemoryAgents(agentRecord()),
    parts.labels ?? new MemoryLabels(),
    parts.executions,
    parts.fire,
    new StubEvents(),
    new MemorySources(parts.source),
    new StubProfiles(),
    createWorktrees(),
    new StubMachineConfig(),
    createLayout(),
    createDriver(),
    createMaterializations(),
    new SilentLogger(),
  );
}

function createBody(partial: Partial<CreateIssueBody>): CreateIssueBody {
  return {
    boardId: 'board-1',
    title: 'Fix the loop',
    statusKey: 'in_progress',
    assigneeAgentId: 'agent-1',
    sourceId: SOURCE_ID,
    ...partial,
  };
}

describe('CreateIssueUseCase fire binding', () => {
  test('issue in a work column without a branch fires into the sandbox and never creates a worktree', async () => {
    const fire = new StubIssueFire();
    const executions = new MemoryIssueExecutions();
    const useCase = buildUseCase({ fire, executions, source: sourceRecord() });

    const response = await useCase.execute({ orgId: ORG_ID, body: createBody({}) });

    expect(response.issue.statusKey).toBe('in_progress');
    expect(response.issue.assigneeAgentId).toBe('agent-1');
    expect(fire.requests).toHaveLength(1);
    expect(fire.requests[0]?.sourceId).toBeUndefined();
    expect(fire.requests[0]?.branch).toBeUndefined();
    expect(fire.requests[0]?.worktreeId).toBeUndefined();
    expect(executions.single()?.worktreeId).toBeNull();
    expect(executions.single()?.state).toBe('active');
  });

  test('issue without source fires unbound and never creates a worktree', async () => {
    const fire = new StubIssueFire();
    const executions = new MemoryIssueExecutions();
    const useCase = buildUseCase({ fire, executions, source: null });

    const response = await useCase.execute({
      orgId: ORG_ID,
      body: createBody({ sourceId: undefined }),
    });

    expect(fire.requests).toHaveLength(1);
    expect(fire.requests[0]?.sourceId).toBeUndefined();
    expect(fire.requests[0]?.worktreeId).toBeUndefined();
    expect(executions.single()?.worktreeId).toBeNull();
    expect(executions.single()?.state).toBe('active');
    expect(response.issue.assigneeAgentId).toBe('agent-1');
  });

  test('issue bound to a branch with no worktree and no matching checkout is held and notified', async () => {
    const fire = new StubIssueFire();
    const executions = new MemoryIssueExecutions();
    const useCase = buildUseCase({ fire, executions, source: sourceRecord() });

    const response = await useCase.execute({
      orgId: ORG_ID,
      body: createBody({ branch: 'feature/x' }),
    });

    expect(response.issue.statusKey).toBe('in_progress');
    expect(fire.requests).toHaveLength(0);
    expect(executions.single()).toBeNull();
  });
});

describe('CreateIssueUseCase label resolution', () => {
  function labelBody(labels: string[]): CreateIssueBody {
    return createBody({
      statusKey: 'backlog',
      assigneeAgentId: undefined,
      sourceId: undefined,
      labels,
    });
  }

  test('label title resolves to the label id on the stored record', async () => {
    const useCase = buildUseCase({
      fire: new StubIssueFire(),
      executions: new MemoryIssueExecutions(),
      source: null,
      labels: new MemoryLabels([labelRecord({})]),
    });

    const response = await useCase.execute({ orgId: ORG_ID, body: labelBody(['backend']) });

    expect(response.issue.labels).toEqual(['label-1']);
  });

  test('label id keeps working', async () => {
    const useCase = buildUseCase({
      fire: new StubIssueFire(),
      executions: new MemoryIssueExecutions(),
      source: null,
      labels: new MemoryLabels([labelRecord({})]),
    });

    const response = await useCase.execute({ orgId: ORG_ID, body: labelBody(['label-1']) });

    expect(response.issue.labels).toEqual(['label-1']);
  });

  test('unknown label fails with guidance to create it first', async () => {
    const useCase = buildUseCase({
      fire: new StubIssueFire(),
      executions: new MemoryIssueExecutions(),
      source: null,
      labels: new MemoryLabels([labelRecord({})]),
    });

    expect(useCase.execute({ orgId: ORG_ID, body: labelBody(['nope']) })).rejects.toThrow(
      'unknown label: nope (no label with this id or title; create it first with label_create)',
    );
  });
});
