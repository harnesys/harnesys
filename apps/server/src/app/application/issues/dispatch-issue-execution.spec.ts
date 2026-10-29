import { describe, expect, test } from 'bun:test';
import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueExecutionActiveException } from '../../domain/issue/issue.error.ts';
import {
  createDriver,
  createIssues,
  createLayout,
  createMaterializations,
  createSources,
  createWorktrees,
  MemoryIssueExecutions,
  issueRecord as makeIssue,
  NOW,
  RecordingEvents,
  StubIssueFire,
  StubMachineConfig,
  sourceRecord,
  worktreeRecord,
} from './dispatch-issue-execution.fakes.ts';
import {
  type DispatchIssueExecutionInput,
  dispatchIssueExecution,
} from './dispatch-issue-execution.ts';

function buildInput(parts: {
  issue: ReturnType<typeof makeIssue>;
  worktrees?: ReturnType<typeof createWorktrees>;
  driver?: ReturnType<typeof createDriver>;
  fire: StubIssueFire;
  executions: MemoryIssueExecutions;
  events: RecordingEvents;
  siblings?: ReturnType<typeof makeIssue>[];
  onReserved?: () => void;
  actorAgentId?: string | null;
}): DispatchIssueExecutionInput {
  return {
    orgId: 'org-1',
    issue: parts.issue,
    board: boardRecord(),
    statusKey: 'in_progress',
    agentId: 'agent-1',
    ...(parts.actorAgentId === undefined ? {} : { actorAgentId: parts.actorAgentId }),
    reason: 'rule',
    matchedLabelId: null,
    executions: parts.executions,
    fire: parts.fire,
    issues: createIssues(parts.siblings ?? []),
    sources: createSources(sourceRecord('src-1')),
    materializations: createMaterializations(),
    events: parts.events,
    worktrees: parts.worktrees ?? createWorktrees(null),
    machineConfig: new StubMachineConfig(),
    layout: createLayout(),
    driver: parts.driver ?? createDriver('main'),
    ...(parts.onReserved ? { onReserved: parts.onReserved } : {}),
  };
}

function boardRecord(): IssueBoardRecord {
  return {
    id: 'board-1',
    orgId: 'org-1',
    name: 'Board',
    description: '',
    color: '#000000',
    icon: 'box',
    status: 'active',
    archivedAt: null,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    statuses: [
      { key: 'todo', label: 'Todo', category: 'started', order: 0, isEntry: true },
      { key: 'in_progress', label: 'In Progress', category: 'started', order: 1, isEntry: false },
      { key: 'done', label: 'Done', category: 'finished', order: 2, isEntry: false },
    ],
    rules: [],
  };
}

describe('dispatchIssueExecution', () => {
  test('worktree plan → fire receives sourceId and worktreeId, execution bound and active', async () => {
    const executions = new MemoryIssueExecutions();
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        worktrees: createWorktrees(worktreeRecord()),
        fire,
        executions,
        events,
      }),
    );
    expect(result).toEqual({ kind: 'dispatched', runId: 'run-1', outcome: 'fired' });
    expect(fire.requests[0]?.sourceId).toBe('src-1');
    expect(fire.requests[0]?.worktreeId).toBe('wt-1');
    expect(executions.single()?.worktreeId).toBe('wt-1');
    expect(executions.single()?.state).toBe('active');
    expect(events.notifications).toEqual([]);
  });

  test('checkout plan → fire carries sourceId only, execution without worktree', async () => {
    const executions = new MemoryIssueExecutions();
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        fire,
        executions,
        events,
        driver: createDriver('main'),
      }),
    );
    expect(result).toEqual({ kind: 'dispatched', runId: 'run-1', outcome: 'fired' });
    expect(fire.requests[0]?.sourceId).toBe('src-1');
    expect(fire.requests[0]?.worktreeId).toBeUndefined();
    expect(executions.single()?.worktreeId).toBeNull();
  });

  test('blocked plan → no fire, rule-notification emitted, nothing reserved', async () => {
    const executions = new MemoryIssueExecutions();
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        fire,
        executions,
        events,
        driver: createDriver('develop'),
      }),
    );
    expect(result).toEqual({ kind: 'blocked' });
    expect(fire.requests).toHaveLength(0);
    expect(executions.single()).toBeNull();
    expect(events.notifications).toEqual([
      'issue needs a worktree for branch main — create it on the issue (Create now / auto on status)',
    ]);
  });

  test('checkout plan with an open sibling on the branch → run still fires, warning names the sibling', async () => {
    const executions = new MemoryIssueExecutions();
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        fire,
        executions,
        events,
        siblings: [makeIssue({ id: 'issue-2', title: 'Sibling' })],
      }),
    );
    expect(result).toEqual({ kind: 'dispatched', runId: 'run-1', outcome: 'fired' });
    expect(events.notifications).toEqual([
      'open issue "Sibling" (issue-2) also uses branch main — the checkout is shared, run them sequentially or give this issue its own worktree',
    ]);
  });

  test('fire outcome thread-busy → execution released, onReserved persisted once', async () => {
    const executions = new MemoryIssueExecutions();
    const fire = new StubIssueFire();
    fire.result = { outcome: 'thread-busy' };
    const events = new RecordingEvents();
    let reservedCalls = 0;
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        fire,
        executions,
        events,
        onReserved: () => {
          reservedCalls += 1;
        },
      }),
    );
    expect(result).toEqual({ kind: 'dispatched', runId: null, outcome: 'thread-busy' });
    expect(reservedCalls).toBe(1);
    expect(executions.single()?.state).toBe('released');
  });
});

function seedActiveExecution(
  executions: MemoryIssueExecutions,
  parts: { agentId: string; statusKey: string; runId: string },
): void {
  const reserved = executions.reserve({
    id: 'exec-active',
    orgId: 'org-1',
    issueId: 'issue-1',
    agentId: parts.agentId,
    correlationId: `issue:issue-1:${parts.statusKey}:${parts.agentId}`,
    requestedStatus: parts.statusKey,
    createdAt: NOW,
    updatedAt: NOW,
  });
  executions.activate('org-1', reserved.id, parts.runId, NOW);
}

describe('dispatchIssueExecution with active execution', () => {
  test('own active execution + actor match → released, new dispatch fires', async () => {
    const executions = new MemoryIssueExecutions();
    seedActiveExecution(executions, { agentId: 'agent-1', statusKey: 'todo', runId: 'run-old' });
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    const result = await dispatchIssueExecution(
      buildInput({
        issue: makeIssue({}),
        fire,
        executions,
        events,
        actorAgentId: 'agent-1',
      }),
    );
    expect(result).toEqual({ kind: 'dispatched', runId: 'run-1', outcome: 'fired' });
    const states = [...executions.rows.values()].map((row) => [row.correlationId, row.state]);
    expect(states).toContainEqual(['issue:issue-1:todo:agent-1', 'released']);
    expect(states).toContainEqual(['issue:issue-1:in_progress:agent-1', 'active']);
  });

  test("other agent's active execution → conflict, nothing fires", async () => {
    const executions = new MemoryIssueExecutions();
    seedActiveExecution(executions, { agentId: 'agent-2', statusKey: 'todo', runId: 'run-old' });
    const fire = new StubIssueFire();
    const events = new RecordingEvents();
    expect(
      dispatchIssueExecution(
        buildInput({
          issue: makeIssue({}),
          fire,
          executions,
          events,
          actorAgentId: 'agent-1',
        }),
      ),
    ).rejects.toThrow(IssueExecutionActiveException);
    expect(fire.requests).toHaveLength(0);
  });
});
