import { describe, expect, test } from 'bun:test';
import { APICallError } from 'ai';
import { SPAWN_ITEM_LIMIT, SPAWN_MAX_CONCURRENCY } from '../constants.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { GraphOpts } from './graph.ts';
import { executeSpawn, prepareSpawn, type SpawnNodeSpec } from './graph-spawn.ts';

const CHILD: AgentDefinition = {
  id: 'child',
  prompts: {},
  graph: {
    nodes: { start: { type: 'core:start' }, end: { type: 'core:end' } },
    edges: [{ from: 'start', to: 'end' }],
  },
};

const PARENT: AgentDefinition = {
  id: 'parent',
  prompts: {},
  graph: {
    nodes: { start: { type: 'core:start' }, end: { type: 'core:end' } },
    edges: [{ from: 'start', to: 'end' }],
  },
};

function snapshot(status: string, state: Record<string, unknown> = {}): Snapshot {
  return {
    sessionId: 'session-1',
    runId: 'run-1',
    definitionHash: 'def',
    planHash: 'plan',
    sequence: 1,
    status,
    runtimeVersion: '1',
    initialInput: null,
    state,
    cursor: { nodes: {} },
  };
}

function fakeState(load: () => Snapshot | null): RuntimeState {
  return {
    sessionId: 'session-1',
    load,
    commit: async () => {},
    child: () => fakeState(load),
  };
}

const AGENTS: AgentsResolve = {
  resolve: (id) => (id === CHILD.id ? CHILD : undefined),
  list: () => [{ id: CHILD.id, name: CHILD.id }],
};

const BROKEN: AgentDefinition = {
  id: 'broken',
  prompts: {},
  graph: {
    nodes: {
      start: { type: 'core:start' },
      second: { type: 'core:start' },
      end: { type: 'core:end' },
    },
    edges: [{ from: 'start', to: 'end' }],
  },
};

const MIXED_AGENTS: AgentsResolve = {
  resolve: (id) => {
    if (id === BROKEN.id) {
      return BROKEN;
    }
    return id === CHILD.id ? CHILD : undefined;
  },
  list: () => [
    { id: CHILD.id, name: CHILD.id },
    { id: BROKEN.id, name: BROKEN.id },
  ],
};

function parentOpts(
  state: RuntimeState,
  signal?: AbortSignal,
  agents: AgentsResolve = AGENTS,
): GraphOpts {
  return {
    agent: PARENT,
    input: null,
    state,
    models: [],
    toolRegistry: new Map(),
    plan: { nodes: {}, edgesByFrom: new Map(), order: [] },
    toolMessages: 'barrier',
    agents,
    ...(signal !== undefined ? { signal } : {}),
  };
}

function node(overrides: Partial<SpawnNodeSpec> = {}): SpawnNodeSpec {
  return {
    type: 'control:spawn',
    calls: '$state.spawns',
    concurrency: 'parallel',
    ...overrides,
  };
}

const SLOTS = { input: null, state: {}, output: null, resume: null };

interface ConcurrencyProbe {
  peak: number;
  started: number;
}

function probeRunner(
  delayMs: number,
  probe: ConcurrencyProbe,
  onStart?: () => void,
): (opts: GraphOpts) => AsyncIterable<Event> {
  let active = 0;
  return async function* run(opts) {
    active += 1;
    probe.started += 1;
    probe.peak = Math.max(probe.peak, active);
    onStart?.();
    try {
      await waitOrAbort(delayMs, opts.signal);
      yield childEvent();
    } finally {
      active -= 1;
    }
  };
}

function childEvent(): Event {
  return {
    eventId: 'event-1',
    type: 'child.progress',
    timestamp: Date.now(),
    sessionId: 'session-1',
    runId: 'run-1',
    agentId: CHILD.id,
    sequence: 1,
  };
}

function waitOrAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { code: 'aborted' }));
      },
      { once: true },
    );
  });
}

function calls(count: number): { agentId: string; input: unknown }[] {
  return Array.from({ length: count }, (_, i) => ({
    agentId: CHILD.id,
    input: `task ${i}`,
  }));
}

function captureRunner(captured: GraphOpts[]): (opts: GraphOpts) => AsyncIterable<Event> {
  return async function* run(opts) {
    captured.push(opts);
    yield childEvent();
  };
}

describe('prepareSpawn', () => {
  test('caps the number of children at the item limit', () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    expect(() =>
      prepareSpawn(node(), parent, { ...SLOTS, state: { spawns: calls(SPAWN_ITEM_LIMIT + 1) } }),
    ).toThrow(/spawn calls exceed limit/);
  });

  test('resolves the default concurrency cap', () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node(), parent, { ...SLOTS, state: { spawns: calls(2) } });
    expect(prepared.maxConcurrency).toBe(SPAWN_MAX_CONCURRENCY);
    expect(prepared.onTimeout).toBe('partial');
    expect(prepared.timeoutMs).toBeUndefined();
  });

  test('takes the node concurrency cap and timeout', () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(
      node({ maxConcurrency: 2, timeoutMs: 500, onTimeout: 'fail' }),
      parent,
      { ...SLOTS, state: { spawns: calls(2) } },
    );
    expect(prepared.maxConcurrency).toBe(2);
    expect(prepared.timeoutMs).toBe(500);
    expect(prepared.onTimeout).toBe('fail');
  });

  test('rejects an invalid concurrency cap', () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    expect(() =>
      prepareSpawn(node({ maxConcurrency: 0 }), parent, {
        ...SLOTS,
        state: { spawns: calls(1) },
      }),
    ).toThrow(/maxConcurrency/);
  });
});

describe('executeSpawn', () => {
  test('runs at most maxConcurrency children at once', async () => {
    const probe: ConcurrencyProbe = { peak: 0, started: 0 };
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node({ maxConcurrency: 2 }), parent, {
      ...SLOTS,
      state: { spawns: calls(6) },
    });
    const outcome = await executeSpawn(prepared, parent, probeRunner(5, probe));
    expect(probe.started).toBe(6);
    expect(probe.peak).toBe(2);
    expect(outcome.results).toHaveLength(6);
    expect(outcome.timedOut).toBe(false);
  });

  test('runs children one by one in sequential mode', async () => {
    const probe: ConcurrencyProbe = { peak: 0, started: 0 };
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node({ concurrency: 'sequential' }), parent, {
      ...SLOTS,
      state: { spawns: calls(3) },
    });
    await executeSpawn(prepared, parent, probeRunner(1, probe));
    expect(probe.peak).toBe(1);
  });

  test('returns a partial result with aborted children on timeout', async () => {
    const probe: ConcurrencyProbe = { peak: 0, started: 0 };
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node({ maxConcurrency: 1, timeoutMs: 20 }), parent, {
      ...SLOTS,
      state: { spawns: calls(3) },
    });
    const outcome = await executeSpawn(prepared, parent, probeRunner(200, probe));
    expect(outcome.timedOut).toBe(true);
    expect(outcome.results).toHaveLength(3);
    const aborted = outcome.results.filter((r) => r.error !== undefined);
    expect(aborted).toHaveLength(3);
    for (const item of aborted) {
      expect(item.error?.code).toBe('spawn_timeout');
    }
    expect(probe.started).toBe(1);
  });

  test('fails the node on timeout when onTimeout is fail', async () => {
    const probe: ConcurrencyProbe = { peak: 0, started: 0 };
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(
      node({ maxConcurrency: 1, timeoutMs: 20, onTimeout: 'fail' }),
      parent,
      { ...SLOTS, state: { spawns: calls(2) } },
    );
    await expect(executeSpawn(prepared, parent, probeRunner(200, probe))).rejects.toThrow(
      /spawn timed out/,
    );
  });
});

function failingRunner(error: unknown): (opts: GraphOpts) => AsyncIterable<Event> {
  return () => ({
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.reject(error),
    }),
  });
}

describe('executeSpawn child isolation', () => {
  test('reports an invalid child definition without killing the parent', async () => {
    const parent = parentOpts(
      fakeState(() => snapshot('completed')),
      undefined,
      MIXED_AGENTS,
    );
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: {
        spawns: [
          { agentId: BROKEN.id, input: 'broken' },
          { agentId: CHILD.id, input: 'fine' },
        ],
      },
    });
    const probe: ConcurrencyProbe = { peak: 0, started: 0 };
    const outcome = await executeSpawn(prepared, parent, probeRunner(1, probe));
    expect(outcome.results).toHaveLength(2);
    const broken = outcome.results.find((r) => r.agentId === BROKEN.id);
    expect(broken?.error?.code).toBe('agent_invalid');
    expect(broken?.output).toBeNull();
    const healthy = outcome.results.find((r) => r.agentId === CHILD.id);
    expect(healthy?.error).toBeUndefined();
    expect(probe.started).toBe(1);
  });

  test('maps a provider failure in the child to a provider error', async () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node(), parent, { ...SLOTS, state: { spawns: calls(1) } });
    const failing = failingRunner(
      new APICallError({
        message: 'Provider returned error',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: {},
        responseBody: JSON.stringify({
          error: {
            message: 'Provider returned error',
            code: 429,
            metadata: { provider_name: 'Poolside', raw: 'rate-limited upstream' },
          },
        }),
        isRetryable: true,
      }),
    );
    const outcome = await executeSpawn(prepared, parent, failing);
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]?.error?.code).toBe('provider_rate_limited');
    expect(outcome.results[0]?.error?.message).toContain('Provider error');
    expect(outcome.results[0]?.error?.message).toContain('429');
  });

  test('keeps the plain error code for a non-provider child failure', async () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node(), parent, { ...SLOTS, state: { spawns: calls(1) } });
    const failing = failingRunner(
      Object.assign(new Error('tool exploded'), { code: 'tool_failed' }),
    );
    const outcome = await executeSpawn(prepared, parent, failing);
    expect(outcome.results[0]?.error?.code).toBe('tool_failed');
    expect(outcome.results[0]?.error?.message).toBe('tool exploded');
  });
});

describe('spawn permissions', () => {
  test('applies a per-call grant on top of the default gates', async () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: {
        spawns: [{ agentId: CHILD.id, input: 'task', permissions: { 'fs.write': 'allow' } }],
      },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.['fs.write']).toBe('allow');
    expect(captured[0]?.permissions?.process).toBe('ask');
  });

  test('keeps a parent deny even with an allow grant', async () => {
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissions: { 'fs.write': 'deny' } as const,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: {
        spawns: [{ agentId: CHILD.id, input: 'task', permissions: { 'fs.write': 'allow' } }],
      },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.['fs.write']).toBe('deny');
  });

  test('keeps the legacy intersection when no grant is passed', async () => {
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissions: { 'fs.write': 'deny' } as const,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: CHILD.id, input: 'task' }] },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.['fs.write']).toBe('deny');
    expect(captured[0]?.permissions?.['fs.read']).toBe('allow');
  });

  test('rejects an invalid gate value in a spawn call', () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    expect(() =>
      prepareSpawn(node(), parent, {
        ...SLOTS,
        state: {
          spawns: [{ agentId: CHILD.id, input: 'task', permissions: { 'fs.write': 'maybe' } }],
        },
      }),
    ).toThrow(/calls\[0\]\.permissions\.fs.write must be allow\|ask\|deny/);
  });
});
