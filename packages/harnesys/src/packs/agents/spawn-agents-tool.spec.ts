import { describe, expect, test } from 'bun:test';
import { SPAWN_ITEM_LIMIT } from '../../constants.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { spawnAgentTool } from './spawn-agents-tool.ts';

const deps = {
  agents: {
    list: async () => [{ id: 'child', name: 'child', role: 'explore', instructions: 'do it' }],
    get: async () => null,
    create: async () => {
      throw new Error('not used');
    },
  },
  resolveScope: () => ({
    orgId: 'org-1',
    agentId: 'agent-1',
    sourceIds: [],
    threadId: 'thread-1',
  }),
};

const ctx = {} as ToolContext;

function call(agentId: string): { agentId: string; input: string } {
  return { agentId, input: 'do it' };
}

describe('agents_spawn tool', () => {
  test('declares the item limit in the schema', () => {
    const tool = spawnAgentTool(deps);
    const schema = tool.input as {
      properties: { calls: { maxItems?: number } };
    };
    expect(schema.properties.calls.maxItems).toBe(SPAWN_ITEM_LIMIT);
  });

  test('rejects more calls than the limit', async () => {
    const tool = spawnAgentTool(deps);
    const raw = {
      calls: Array.from({ length: SPAWN_ITEM_LIMIT + 1 }, () => call('child')),
    };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ error: `calls exceed limit ${SPAWN_ITEM_LIMIT}` });
  });

  test('accepts calls within the limit', async () => {
    const tool = spawnAgentTool(deps);
    const raw = { calls: [call('child'), call('child')] };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ calls: raw.calls });
  });

  test('accepts the messages form of the child input', async () => {
    const tool = spawnAgentTool(deps);
    const raw = {
      calls: [{ agentId: 'child', input: { messages: [{ role: 'user', content: 'do it' }] } }],
    };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ calls: raw.calls });
  });

  test('rejects a guessed input shape instead of handing the child nothing', async () => {
    const tool = spawnAgentTool(deps);
    const guessed = { calls: [{ agentId: 'child', input: { $text: 'do it' } }] };
    const out = await tool.execute(guessed, ctx);
    expect(out).toEqual({
      error: 'calls[0].input must be a string or { messages: [{ role, content }] }',
    });
  });

  test('rejects a messages object that is not an array', async () => {
    const tool = spawnAgentTool(deps);
    const guessed = {
      calls: [{ agentId: 'child', input: { messages: { item: { role: 'user', content: 'x' } } } }],
    };
    const out = await tool.execute(guessed, ctx);
    expect(out).toEqual({
      error: 'calls[0].input must be a string or { messages: [{ role, content }] }',
    });
  });

  test('rejects a message without content', async () => {
    const tool = spawnAgentTool(deps);
    const raw = { calls: [{ agentId: 'child', input: { messages: [{ role: 'user' }] } }] };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ error: 'calls[0].input.messages[0].content must be a non-empty string' });
  });

  test('accepts a permissions grant and echoes it in the calls', async () => {
    const tool = spawnAgentTool(deps);
    const raw = {
      calls: [{ agentId: 'child', input: 'do it', permissions: { 'fs.write': 'allow' } }],
    };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ calls: raw.calls });
  });

  test('rejects an invalid permission gate value', async () => {
    const tool = spawnAgentTool(deps);
    const raw = {
      calls: [{ agentId: 'child', input: 'do it', permissions: { 'fs.write': 'maybe' } }],
    };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ error: 'calls[0].permissions.fs.write must be allow|ask|deny' });
  });

  test('rejects non-object permissions', async () => {
    const tool = spawnAgentTool(deps);
    const raw = { calls: [{ agentId: 'child', input: 'do it', permissions: 'allow' }] };
    const out = await tool.execute(raw, ctx);
    expect(out).toEqual({ error: 'calls[0].permissions must be an object' });
  });
});
