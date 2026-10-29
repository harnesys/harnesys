import { describe, expect, test } from 'bun:test';
import type { AgentRecord } from '../agent/agent.ts';
import type { ThreadRecord } from '../thread/thread.ts';
import { budgetPercentOf, buildPulse } from './pulse-math.ts';

const DAY = '2026-10-18';
const NOW = '2026-10-18T12:00:00.000Z';

function agentOf(id: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    orgId: 'org-1',
    name: id,
    role: 'coder',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: null,
    level: 'top',
    parentId: null,
    executionProfileId: null,
    status: 'active',
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
    ...overrides,
  };
}

function threadOf(id: string, overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id,
    orgId: 'org-1',
    agentId: 'agent-1',
    originAgentId: 'agent-1',
    title: `thread ${id}`,
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: NOW,
    updatedAt: NOW,
    lastReadAt: NOW,
    ...overrides,
  };
}

describe('budgetPercentOf', () => {
  test('null budget yields null', () => {
    expect(budgetPercentOf(5, null)).toBeNull();
  });
  test('zero budget yields null', () => {
    expect(budgetPercentOf(5, 0)).toBeNull();
  });
  test('boundary percents', () => {
    expect(budgetPercentOf(50, 100)).toBe(50);
    expect(budgetPercentOf(90, 100)).toBe(90);
    expect(budgetPercentOf(100, 100)).toBe(100);
  });
  test('rounds to nearest integer', () => {
    expect(budgetPercentOf(1, 3)).toBe(33);
    expect(budgetPercentOf(2, 3)).toBe(67);
  });
});

describe('buildPulse', () => {
  test('maps agent spend, budget and percent', () => {
    const pulse = buildPulse({
      agents: [agentOf('a1', { budgetUsdDaily: 4 })],
      threads: [],
      spentByAgent: new Map([['a1', 3]]),
      pendingApprovals: 0,
      openIssues: 0,
      day: DAY,
    });
    expect(pulse.agents).toEqual([
      {
        agentId: 'a1',
        name: 'a1',
        role: 'coder',
        spentUsdToday: 3,
        budgetUsdDaily: 4,
        budgetPercent: 75,
      },
    ]);
  });

  test('agent without budget keeps null percent', () => {
    const pulse = buildPulse({
      agents: [agentOf('a1')],
      threads: [],
      spentByAgent: new Map([['a1', 2]]),
      pendingApprovals: 0,
      openIssues: 0,
      day: DAY,
    });
    expect(pulse.agents[0]?.budgetPercent).toBeNull();
    expect(pulse.agents[0]?.spentUsdToday).toBe(2);
  });

  test('agents missing from spend map count zero', () => {
    const pulse = buildPulse({
      agents: [agentOf('a1')],
      threads: [],
      spentByAgent: new Map(),
      pendingApprovals: 0,
      openIssues: 0,
      day: DAY,
    });
    expect(pulse.agents[0]?.spentUsdToday).toBe(0);
  });

  test('failed threads come from metadata.lastError with agent name', () => {
    const failed = threadOf('t1', {
      agentId: 'a2',
      metadata: { lastError: { runId: 'r1', message: 'boom', at: NOW } },
    });
    const pulse = buildPulse({
      agents: [agentOf('a1'), agentOf('a2', { name: 'reviewer' })],
      threads: [threadOf('t0'), failed, threadOf('t2')],
      spentByAgent: new Map(),
      pendingApprovals: 0,
      openIssues: 0,
      day: DAY,
    });
    expect(pulse.failedThreads).toEqual([
      {
        threadId: 't1',
        title: 'thread t1',
        agentId: 'a2',
        agentName: 'reviewer',
        kind: 'chat',
        lastError: 'boom',
        updatedAt: NOW,
      },
    ]);
  });

  test('lastError as plain string counts as failure', () => {
    const pulse = buildPulse({
      agents: [],
      threads: [threadOf('t1', { metadata: { lastError: 'plain' } })],
      spentByAgent: new Map(),
      pendingApprovals: 0,
      openIssues: 0,
      day: DAY,
    });
    expect(pulse.failedThreads.map((t) => t.lastError)).toEqual(['plain']);
  });

  test('spendUsdToday sums per-agent spend', () => {
    const pulse = buildPulse({
      agents: [agentOf('a1'), agentOf('a2')],
      threads: [],
      spentByAgent: new Map([
        ['a1', 1.25],
        ['a2', 0.75],
      ]),
      pendingApprovals: 2,
      openIssues: 7,
      day: DAY,
    });
    expect(pulse.spendUsdToday).toBe(2);
    expect(pulse.pendingApprovals).toBe(2);
    expect(pulse.openIssues).toBe(7);
  });
});
