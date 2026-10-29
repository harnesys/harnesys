import { describe, expect, test } from 'bun:test';
import type { CapabilityScope, ManagerUsageReport } from 'harnesys';
import type { UsageGroupRow } from '../../../domain/usage/usage-port.ts';
import { FakeOrgSettings, FakeTail, FakeUsage, managerPort } from './org-manager.port.fakes.ts';
import { MemoryAgents } from './wire-org-packs.fakes.ts';

const SCOPE: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-1',
  sourceIds: [],
  threadId: 'thread-1',
};

function insertAgent(agents: MemoryAgents): void {
  agents.insert({
    id: 'a1',
    orgId: 'org-1',
    name: 'coder',
    role: 'coder',
    instructions: '',
    modelId: 'model-1',
    budgetUsdDaily: 10,
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('OrgManagerPort', () => {
  test('pulse aggregates per-agent spend through sumAgentDayCostUsd', async () => {
    const agents = new MemoryAgents();
    insertAgent(agents);
    const usage = new FakeUsage();
    usage.spendByAgent.set('a1', 2.5);
    const { port } = managerPort({ agents, usage });
    const pulse = await port.pulse(SCOPE);
    expect(pulse.agents).toHaveLength(1);
    expect(pulse.agents[0]).toMatchObject({
      agentId: 'a1',
      name: 'coder',
      spentUsdToday: 2.5,
      budgetUsdDaily: 10,
      budgetPercent: 25,
    });
    expect(pulse.spendUsdToday).toBe(2.5);
  });

  test('pulse asks for the spend of the org timezone local day', async () => {
    const agents = new MemoryAgents();
    insertAgent(agents);
    const usage = new FakeUsage();
    const orgSettings = new FakeOrgSettings();
    orgSettings.timezone = 'Europe/Moscow';
    const { port } = managerPort({ agents, usage, orgSettings });
    await port.pulse(SCOPE);
    const range = usage.dayRanges.at(0);
    expect(range?.agentId).toBe('a1');
    expect(range?.fromIso).toMatch(/T21:00:00\.000Z$/);
    expect(range?.toIso).toMatch(/T21:00:00\.000Z$/);
  });

  test('usage maps UsagePort.report to ManagerUsageReport', async () => {
    const usage = new FakeUsage();
    const rows: UsageGroupRow[] = [
      {
        key: '2026-10-18',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        costUsd: 1.5,
        unpriced: 0,
        runs: 3,
      },
      {
        key: '2026-10-17',
        inputTokens: 50,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        costUsd: 0.5,
        unpriced: 1,
        runs: 2,
      },
    ];
    usage.reportResult = {
      rows,
      totals: {
        inputTokens: 150,
        outputTokens: 30,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
        costUsd: 2,
      },
      byMember: [],
    };
    const { port } = managerPort({ usage });
    const report: ManagerUsageReport = await port.usage(SCOPE, { groupBy: 'day' });
    expect(report).toEqual({
      rows: [
        { key: '2026-10-18', inputTokens: 100, outputTokens: 20, costUsd: 1.5, runs: 3 },
        { key: '2026-10-17', inputTokens: 50, outputTokens: 10, costUsd: 0.5, runs: 2 },
      ],
      totalCostUsd: 2,
      totalRuns: 5,
    });
  });

  test('threadTail delegates to tail port with clamped limit', async () => {
    const tail = new FakeTail();
    const { port } = managerPort({ tail });
    const items = await port.threadTail(SCOPE, 'thread-9', 5);
    expect(tail.calls).toEqual([{ orgId: 'org-1', threadId: 'thread-9', limit: 5 }]);
    expect(items).toHaveLength(2);
    expect(items[0]?.seq).toBe(2);
    const clamped = await port.threadTail(SCOPE, 'thread-9', 500);
    expect(clamped).toHaveLength(2);
    expect(tail.calls.at(-1)).toEqual({ orgId: 'org-1', threadId: 'thread-9', limit: 100 });
  });
});
