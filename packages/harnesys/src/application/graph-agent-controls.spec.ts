import { describe, expect, test } from 'bun:test';
import { applyAgentControlToolResults } from './graph-agent-controls.ts';

describe('applyAgentControlToolResults', () => {
  test('agents_spawn result queues calls with permissions and budget', () => {
    const state: Record<string, unknown> = {};
    applyAgentControlToolResults(
      [
        {
          name: 'agents_spawn',
          result: {
            calls: [
              {
                agentId: 'coder-12345678',
                input: 'write the file',
                budget: { maxSteps: 10 },
                permissions: { 'fs.write': 'allow', 'fs.read': 'allow' },
              },
            ],
          },
        },
      ],
      state,
    );
    const spawns = state.spawns as Array<Record<string, unknown>>;
    expect(spawns).toHaveLength(1);
    const first = spawns[0] as Record<string, unknown>;
    expect(first.permissions).toEqual({ 'fs.write': 'allow', 'fs.read': 'allow' });
    expect(first.budget).toEqual({ maxSteps: 10 });
    expect(typeof first.spawnId).toBe('string');
  });

  test('a call without permissions keeps the key absent', () => {
    const state: Record<string, unknown> = {};
    applyAgentControlToolResults(
      [{ name: 'agents_spawn', result: { calls: [{ agentId: 'qa-12345678', input: 'check' }] } }],
      state,
    );
    const spawns = state.spawns as Array<Record<string, unknown>>;
    const first = spawns[0] as Record<string, unknown>;
    expect('permissions' in first).toBe(false);
  });
});
