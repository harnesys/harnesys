import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';

const MODELS: ModelsPort = {
  get: async () => ({
    name: 'test',
    driver: 'openai-compatible',
    enabled: true,
    model: { name: 'test', context_length: 128000 },
  }),
};

let pingCount = 0;
const PING: ToolDefinition = {
  name: 'ping',
  description: 'side effect',
  operations: ['process'],
  input: { type: 'object', properties: {} },
  execute: () => {
    pingCount += 1;
    return 'pong';
  },
};

const PERMISSIONS: PermissionMap = { process: 'ask' };

const CHILD: AgentDefinition = {
  id: 'child',
  prompts: {},
  graph: {
    nodes: {
      start: { type: 'core:start' },
      act: { type: 'tool:call', name: 'ping', args: {} },
      end: { type: 'core:end' },
    },
    edges: [
      { from: 'start', to: 'act' },
      { from: 'act', to: 'end' },
    ],
  },
};

function parentOf(spawnId: string): AgentDefinition {
  return {
    id: 'parent',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'test', model: 'test' },
    state: { initial: { spawns: [{ agentId: 'child', input: 'go', spawnId }] } },
    graph: {
      nodes: {
        start: { type: 'core:start' },
        spawn: { type: 'control:spawn', calls: '$state.spawns', concurrency: 'parallel' },
        end: { type: 'core:end' },
      },
      edges: [
        { from: 'start', to: 'spawn' },
        { from: 'spawn', to: 'end' },
      ],
    },
  };
}

async function run(
  state: InMemoryRuntimeState,
  agent: AgentDefinition,
  opts: Partial<GraphOpts> = {},
): Promise<Event[]> {
  const events: Event[] = [];
  for await (const ev of startGraph({
    agent,
    input: null,
    state,
    models: MODELS,
    toolRegistry: new Map([[PING.name, PING]]),
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    permissions: PERMISSIONS,
    paths: { cwd: '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode' },
    agents: { resolve: (id) => (id === 'child' ? CHILD : undefined) },
    ...opts,
  })) {
    events.push(ev);
  }
  return events;
}

async function parkDelegatedAsk(
  state: InMemoryRuntimeState,
  spawnId: string,
): Promise<{ agent: AgentDefinition; first: Event[] }> {
  const agent = parentOf(spawnId);
  const first = await run(state, agent);
  const asks = first.filter((ev) => ev.type === 'interrupt.triggered');
  expect(asks).toHaveLength(1);
  expect((asks[0]?.metadata as Record<string, unknown> | undefined)?.source).toBe('permission');
  expect(first.filter((ev) => ev.type === 'agent.spawned')).toHaveLength(1);
  expect(pingCount).toBe(0);
  const snap = await state.load();
  expect(snap?.cursor.interrupt?.delegated?.spawnId).toBe(spawnId);
  return { agent, first };
}

function resumeOpts(snap: Snapshot | null): Partial<GraphOpts> {
  const interrupt = snap?.cursor.interrupt;
  return {
    startNodeId: interrupt?.nodeId,
    outputHint: interrupt?.output ?? null,
    resumeInterruptId: interrupt?.interruptId,
  };
}

describe('delegated permission ask cycle through the spawn node', () => {
  test('approved resume executes the child call and never re-emits agent.spawned', async () => {
    pingCount = 0;
    const spawnId = 'spawn-1';
    const state = new InMemoryRuntimeState('session-delegated-allow');
    const { agent, first } = await parkDelegatedAsk(state, spawnId);
    const snap = await state.load();
    const second = await run(state, agent, {
      ...resumeOpts(snap),
      resumePayload: { approved: true, scope: 'once' },
    });
    const all = [...first, ...second];
    expect(all.filter((ev) => ev.type === 'agent.spawned')).toHaveLength(1);
    expect(all.filter((ev) => ev.type === 'agent.completed')).toHaveLength(1);
    expect(all.filter((ev) => ev.type === 'agent.failed')).toHaveLength(0);
    expect(pingCount).toBe(1);
    expect(second.some((ev) => ev.type === 'run.completed')).toBe(true);
  });

  test('denied resume skips the child call and never re-emits agent.spawned', async () => {
    pingCount = 0;
    const spawnId = 'spawn-2';
    const state = new InMemoryRuntimeState('session-delegated-deny');
    const { agent, first } = await parkDelegatedAsk(state, spawnId);
    const snap = await state.load();
    const second = await run(state, agent, {
      ...resumeOpts(snap),
      resumePayload: { approved: false, scope: 'once' },
    });
    const all = [...first, ...second];
    expect(all.filter((ev) => ev.type === 'agent.spawned')).toHaveLength(1);
    expect(pingCount).toBe(0);
    expect(second.some((ev) => ev.type === 'interrupt.triggered')).toBe(false);
    expect(second.some((ev) => ev.type === 'run.completed')).toBe(true);
  });
});
