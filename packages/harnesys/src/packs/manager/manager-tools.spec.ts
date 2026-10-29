import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import { ManagerObservationPort } from '../../ports/manager-observation.ts';
import { createManagerTools } from './create-manager-tools.ts';

const scope: CapabilityScope = {
  orgId: 'org-1',
  agentId: 'agent-9',
  sourceIds: [],
  threadId: 'thread-1',
};

const ctx = { cwd: '/tmp', paths: { allow: [] }, agentId: 'agent-9' };

class FakeObservation extends ManagerObservationPort {
  pulseScopes: CapabilityScope[] = [];
  usageCalls: Array<{
    scope: CapabilityScope;
    query: { from?: string; to?: string; groupBy?: 'day' | 'agent' };
  }> = [];
  tailCalls: Array<{ scope: CapabilityScope; threadId: string; limit: number }> = [];
  failure?: Error;

  async pulse(scope: CapabilityScope) {
    this.pulseScopes.push(scope);
    if (this.failure) {
      throw this.failure;
    }
    return {
      agents: [
        {
          agentId: 'agent-1',
          name: 'coder',
          role: 'coder',
          spentUsdToday: 1.5,
          budgetUsdDaily: 10,
          budgetPercent: 15,
        },
      ],
      failedThreads: [
        {
          threadId: 'thread-7',
          title: 'fix build',
          agentId: 'agent-1',
          agentName: 'coder',
          kind: 'work',
          lastError: 'boom',
          updatedAt: '2026-10-18T10:00:00Z',
        },
      ],
      pendingApprovals: 2,
      openIssues: 5,
      spendUsdToday: 1.5,
    };
  }

  async usage(
    scope: CapabilityScope,
    query: { from?: string; to?: string; groupBy?: 'day' | 'agent' },
  ) {
    this.usageCalls.push({ scope, query });
    if (this.failure) {
      throw this.failure;
    }
    return {
      rows: [{ key: '2026-10-18', inputTokens: 10, outputTokens: 20, costUsd: 0.5, runs: 2 }],
      totalCostUsd: 0.5,
      totalRuns: 2,
    };
  }

  async threadTail(scope: CapabilityScope, threadId: string, limit: number) {
    this.tailCalls.push({ scope, threadId, limit });
    if (this.failure) {
      throw this.failure;
    }
    return [{ seq: 1, runId: 'run-1', kind: 'message', at: '2026-10-18T10:00:00Z', preview: 'hi' }];
  }
}

function toolMap(observation: FakeObservation) {
  return new Map(
    createManagerTools({ observation, resolveScope: () => scope }).map((t) => [t.name, t]),
  );
}

describe('manager pack tools', () => {
  test('registers exactly three manager tools in the manager group', () => {
    const tools = createManagerTools({
      observation: new FakeObservation(),
      resolveScope: () => scope,
    });
    expect(tools.map((t) => t.name)).toEqual(['manager_pulse', 'usage_report', 'thread_tail']);
    for (const t of tools) {
      expect(t.group).toBe('manager');
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  test('manager_pulse calls pulse with resolved scope and no input', async () => {
    const observation = new FakeObservation();
    const byName = toolMap(observation);
    const result = await byName.get('manager_pulse')?.execute({}, ctx);
    expect(observation.pulseScopes).toEqual([scope]);
    expect(result).toEqual({
      agents: [
        {
          agentId: 'agent-1',
          name: 'coder',
          role: 'coder',
          spentUsdToday: 1.5,
          budgetUsdDaily: 10,
          budgetPercent: 15,
        },
      ],
      failedThreads: [
        {
          threadId: 'thread-7',
          title: 'fix build',
          agentId: 'agent-1',
          agentName: 'coder',
          kind: 'work',
          lastError: 'boom',
          updatedAt: '2026-10-18T10:00:00Z',
        },
      ],
      pendingApprovals: 2,
      openIssues: 5,
      spendUsdToday: 1.5,
    });
  });

  test('usage_report forwards parsed from/to/groupBy to the port', async () => {
    const observation = new FakeObservation();
    const byName = toolMap(observation);
    const result = await byName
      .get('usage_report')
      ?.execute({ from: '2026-10-01', to: '2026-10-18', groupBy: 'agent' }, ctx);
    expect(observation.usageCalls).toEqual([
      { scope, query: { from: '2026-10-01', to: '2026-10-18', groupBy: 'agent' } },
    ]);
    expect(result).toEqual({
      rows: [{ key: '2026-10-18', inputTokens: 10, outputTokens: 20, costUsd: 0.5, runs: 2 }],
      totalCostUsd: 0.5,
      totalRuns: 2,
    });
  });

  test('thread_tail passes threadId and default limit 20', async () => {
    const observation = new FakeObservation();
    const byName = toolMap(observation);
    const result = await byName.get('thread_tail')?.execute({ threadId: 'thread-7' }, ctx);
    expect(observation.tailCalls).toEqual([{ scope, threadId: 'thread-7', limit: 20 }]);
    expect(result).toEqual([
      { seq: 1, runId: 'run-1', kind: 'message', at: '2026-10-18T10:00:00Z', preview: 'hi' },
    ]);
  });

  test('thread_tail clamps limit 0 to 20 and over 100 to 100', async () => {
    const observation = new FakeObservation();
    const byName = toolMap(observation);
    await byName.get('thread_tail')?.execute({ threadId: 't1', limit: 0 }, ctx);
    await byName.get('thread_tail')?.execute({ threadId: 't2', limit: 150 }, ctx);
    await byName.get('thread_tail')?.execute({ threadId: 't3', limit: 50 }, ctx);
    expect(observation.tailCalls.map((c) => c.limit)).toEqual([20, 100, 50]);
  });

  test('port errors become { error: message } results', async () => {
    const observation = new FakeObservation();
    observation.failure = new Error('observation unavailable');
    const byName = toolMap(observation);
    const pulse = await byName.get('manager_pulse')?.execute({}, ctx);
    const usage = await byName.get('usage_report')?.execute({ groupBy: 'day' }, ctx);
    const tail = await byName.get('thread_tail')?.execute({ threadId: 't1' }, ctx);
    expect(pulse).toEqual({ error: 'observation unavailable' });
    expect(usage).toEqual({ error: 'observation unavailable' });
    expect(tail).toEqual({ error: 'observation unavailable' });
  });
});
