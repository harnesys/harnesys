import { describe, expect, test } from 'bun:test';
import { InMemoryRuntimeState } from '../adapters/in-memory-runtime-state.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event } from '../domain/snapshot.ts';
import type { ModelsPort } from '../ports/models.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { compileOrThrow } from './compile.ts';
import { type GraphOpts, startGraph } from './graph.ts';
import type { BackgroundReportInput, BackgroundSpawnRegistry } from './graph-spawn.ts';
import { createBackgroundSpawnRegistry } from './run-engine.ts';

const MODELS: ModelsPort = {
  get: async () => ({
    name: 'test',
    driver: 'openai-compatible',
    enabled: true,
    model: { name: 'test', context_length: 128000 },
  }),
};

let pingCount = 0;
let gate: Promise<void> | null = null;
let releaseChild: (() => void) | null = null;
function openGate(): void {
  gate = new Promise<void>((resolve) => {
    releaseChild = resolve;
  });
}
function closeGate(): void {
  releaseChild?.();
  gate = null;
  releaseChild = null;
}
const CHILD_PING: ToolDefinition = {
  name: 'ping',
  description: 'slow side effect',
  input: { type: 'object', properties: {} },
  execute: async () => {
    if (gate !== null) {
      await gate;
    }
    pingCount += 1;
    return 'pong';
  },
};

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

function parentOf(spawnId: string, background: boolean): AgentDefinition {
  return {
    id: 'parent',
    prompts: { main: { instructions: 'work' } },
    model: { provider: 'test', model: 'test' },
    state: {
      initial: { spawns: [{ agentId: 'child', input: 'go', spawnId, background }] },
    },
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
    runId: 'run-1',
    models: MODELS,
    toolRegistry: new Map([[CHILD_PING.name, CHILD_PING]]),
    plan: compileOrThrow(agent),
    toolMessages: 'barrier',
    paths: { cwd: '/private/var/folders/9n/rd8dcm_j16g_hg2pv661mn3w0000gn/T/opencode' },
    agents: { resolve: (id) => (id === 'child' ? CHILD : undefined) },
    ...opts,
  })) {
    events.push(ev);
  }
  return events;
}
function failingChildRunner(): AsyncIterable<Event> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(new Error('child exploded')),
      };
    },
  };
}

describe('background spawn calls', () => {
  test('background child does not block the node and settles via the registry', async () => {
    pingCount = 0;
    openGate();
    const registry: BackgroundSpawnRegistry = createBackgroundSpawnRegistry();
    const reports: BackgroundReportInput[] = [];
    const state = new InMemoryRuntimeState('session-bg');
    const events = await run(state, parentOf('spawn-bg', true), {
      backgroundSpawns: registry,
      backgroundReport: (input) => reports.push(input),
    });
    expect(events.some((ev) => ev.type === 'agent.spawned')).toBe(true);
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    expect(pingCount).toBe(0);
    expect(registry.pendingCount('run-1')).toBe(1);
    expect(registry.isTracked('run-1', 'spawn-bg')).toBe(true);
    expect(registry.listByThread('session-bg')).toHaveLength(1);
    closeGate();
    const handles = await registry.awaitByThread('session-bg');
    expect(handles).toHaveLength(1);
    expect(handles[0]?.status).toBe('done');
    expect(pingCount).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.spawnId).toBe('spawn-bg');
    expect(reports[0]?.parentAgentId).toBe('parent');
    expect(registry.pendingCount('run-1')).toBe(0);
  });

  test('background child failure carries the error into the report', async () => {
    pingCount = 0;
    gate = null;
    releaseChild = null;
    const registry: BackgroundSpawnRegistry = createBackgroundSpawnRegistry();
    const reports: BackgroundReportInput[] = [];
    const state = new InMemoryRuntimeState('session-bg-fail');
    const events = await run(state, parentOf('spawn-bg-fail', true), {
      backgroundSpawns: registry,
      backgroundReport: (input) => reports.push(input),
      childRunner: failingChildRunner,
    });
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    const handles = await registry.awaitAll('run-1');
    expect(handles[0]?.status).toBe('failed');
    expect(handles[0]?.error?.message).toContain('child exploded');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.error?.message).toContain('child exploded');
  });

  test('abortSpawn cancels a running background child and it settles as failed', async () => {
    pingCount = 0;
    openGate();
    const registry: BackgroundSpawnRegistry = createBackgroundSpawnRegistry();
    const reports: BackgroundReportInput[] = [];
    const state = new InMemoryRuntimeState('session-bg-stop');
    const events = await run(state, parentOf('spawn-bg-stop', true), {
      backgroundSpawns: registry,
      backgroundReport: (input) => reports.push(input),
    });
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    expect(registry.abortSpawn('spawn-bg-stop', 'run cancelled')).toBe(true);
    closeGate();
    const handles = await registry.awaitByThread('session-bg-stop');
    expect(handles[0]?.status).toBe('failed');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reports).toHaveLength(1);
    expect(reports[0]?.error?.code).toBe('spawn_aborted');
  });

  test('blocking child keeps waiting for the node as before', async () => {
    pingCount = 0;
    openGate();
    const registry: BackgroundSpawnRegistry = createBackgroundSpawnRegistry();
    const state = new InMemoryRuntimeState('session-blocking');
    const runPromise = run(state, parentOf('spawn-blocking', false), {
      backgroundSpawns: registry,
    });
    const settled = await Promise.race([
      runPromise.then(() => 'done' as const),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 100)),
    ]);
    expect(settled).toBe('timeout');
    expect(pingCount).toBe(0);
    closeGate();
    const events = await runPromise;
    expect(events.some((ev) => ev.type === 'run.completed')).toBe(true);
    expect(pingCount).toBe(1);
  });
});
