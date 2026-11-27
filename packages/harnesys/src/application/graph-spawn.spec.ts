import { describe, expect, test } from 'bun:test';
import { APICallError } from 'ai';
import { SPAWN_ITEM_LIMIT, SPAWN_MAX_CONCURRENCY } from '../constants.ts';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { PackRegistration } from '../domain/pack.ts';
import { definePack, registerPack } from '../domain/pack.ts';
import type { Event, Snapshot } from '../domain/snapshot.ts';
import type { AgentsResolve } from '../ports/create-runtime.ts';
import { PermissionGrantsPort } from '../ports/permission-grants-port.ts';
import type { RuntimeState } from '../ports/runtime-state.ts';
import type { SkillRegistry } from '../ports/skills.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { GraphOpts } from './graph.ts';
import { executeSpawn, prepareSpawn, type SpawnNodeSpec } from './graph-spawn.ts';
import { fallbackScope, type PackRunOutput } from './packs/pack-run.ts';

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

class FixedGrants extends PermissionGrantsPort {
  override async granted(): Promise<boolean> {
    return true;
  }
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

interface SpawnCallSeed {
  agentId: string;
  input: unknown;
  budget?: { maxSteps?: number };
}

function calls(count: number): SpawnCallSeed[] {
  return Array.from({ length: count }, (_, i) => ({
    agentId: CHILD.id,
    input: `task ${i}`,
    budget: { maxSteps: 10 },
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

  test('resumes a delegated child with the output of its interrupted node', async () => {
    const interruptOutput = { toolCalls: [{ name: 'shell', args: { command: 'echo ok' } }] };
    const childSnap: Snapshot = {
      ...snapshot('needs_input'),
      cursor: {
        nodes: {},
        interrupt: {
          interruptId: 'perm/child:act:0/0',
          reason: 'allow process?',
          resumeSchema: {},
          nodeId: 'act',
          source: 'permission',
          output: interruptOutput,
        },
      },
    };
    let childCurrent: Snapshot = childSnap;
    const parentState: RuntimeState = {
      ...fakeState(() => snapshot('completed')),
      child: () => fakeState(() => childCurrent),
    };
    const journal: { spawnId: string; type: string }[] = [];
    const parent: GraphOpts = {
      ...parentOpts(parentState),
      childJournal: (spawnId, ev) => {
        journal.push({ spawnId, type: ev.type });
      },
    };
    const prepared = prepareSpawn(node({ maxConcurrency: 1 }), parent, {
      ...SLOTS,
      state: { spawns: calls(1) },
    });
    const spawnId = prepared.targets[0]?.spawnId ?? '';
    const captured: GraphOpts[] = [];
    const runner = async function* (opts: GraphOpts): AsyncIterable<Event> {
      captured.push(opts);
      childCurrent = snapshot('completed');
      yield childEvent();
    };
    await executeSpawn(prepared, parent, runner, undefined, {
      spawnId,
      childInterruptId: 'perm/child:act:0/0',
      childNodeId: 'act',
      approved: true,
    });
    expect(captured[0]?.startNodeId).toBe('act');
    expect(captured[0]?.outputHint).toEqual(interruptOutput);
    expect(captured[0]?.runId).toBe(spawnId);
    expect(journal[0]).toEqual({ spawnId, type: 'child.prepared' });
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
          { agentId: BROKEN.id, input: 'broken', budget: { maxSteps: 10 } },
          { agentId: CHILD.id, input: 'fine', budget: { maxSteps: 10 } },
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
  test('a grant is capped by the parent gate', async () => {
    const parent = parentOpts(fakeState(() => snapshot('completed')));
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: {
        spawns: [
          {
            agentId: CHILD.id,
            input: 'task',
            budget: { maxSteps: 10 },
            permissions: { 'fs.write': 'allow' },
          },
        ],
      },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.['fs.write']).toBe('ask');
  });

  test('a grant applies up to the parent allow gate', async () => {
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissions: { 'fs.write': 'allow' } as const,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: {
        spawns: [
          {
            agentId: CHILD.id,
            input: 'task',
            budget: { maxSteps: 10 },
            permissions: { 'fs.write': 'allow' },
          },
        ],
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
        spawns: [
          {
            agentId: CHILD.id,
            input: 'task',
            budget: { maxSteps: 10 },
            permissions: { 'fs.write': 'allow' },
          },
        ],
      },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.['fs.write']).toBe('deny');
  });

  test('a child inherits the parent gates without a grant', async () => {
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissions: { process: 'allow', 'fs.write': 'deny' } as const,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: CHILD.id, input: 'task', budget: { maxSteps: 10 } }] },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissions?.process).toBe('allow');
    expect(captured[0]?.permissions?.['fs.write']).toBe('deny');
  });

  test('a child receives the parent durable permission grants', async () => {
    const grants = new FixedGrants();
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissionGrants: grants,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: CHILD.id, input: 'task', budget: { maxSteps: 10 } }] },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    expect(captured[0]?.permissionGrants).toBe(grants);
  });

  test('a parent deny is inherited without a grant', async () => {
    const parent = {
      ...parentOpts(fakeState(() => snapshot('completed'))),
      permissions: { 'fs.write': 'deny' } as const,
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: CHILD.id, input: 'task', budget: { maxSteps: 10 } }] },
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
          spawns: [
            {
              agentId: CHILD.id,
              input: 'task',
              budget: { maxSteps: 10 },
              permissions: { 'fs.write': 'maybe' },
            },
          ],
        },
      }),
    ).toThrow(/calls\[0\]\.permissions\.fs.write must be allow\|ask\|deny/);
  });
});

describe('executeSpawn child result collection', () => {
  function budgetSnapshot(steps: number, messages: unknown[]): Snapshot {
    return {
      ...snapshot('budget_exceeded', { messages }),
      cursor: { nodes: {}, budget: { steps, tokens: 1200, startedAt: Date.now() - 5000 } },
    };
  }

  const budgetedCall = [
    { agentId: CHILD.id, input: 'task', budget: { maxSteps: 6, maxTokens: 2000 } },
  ];

  test('salvages a composed report from a budget-exceeded child', async () => {
    const report = { role: 'assistant', content: 'closing report' };
    const parent = parentOpts(fakeState(() => budgetSnapshot(7, [report])));
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: budgetedCall },
    });
    const outcome = await executeSpawn(prepared, parent, captureRunner([]));
    const item = outcome.results[0];
    expect(item?.error?.code).toBe('budget_exceeded');
    expect(item?.output).toMatchObject(report);
    expect(item?.budget).toEqual({ kind: 'steps', limit: 6, used: 7, closingStep: true });
  });

  test('keeps the budget hit visible when the child composed no report', async () => {
    const parent = parentOpts(
      fakeState(() => budgetSnapshot(7, [{ role: 'user', content: 'ok' }])),
    );
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: budgetedCall },
    });
    const outcome = await executeSpawn(prepared, parent, captureRunner([]));
    const item = outcome.results[0];
    expect(item?.error?.code).toBe('budget_exceeded');
    expect(item?.output).toBeNull();
    expect(item?.budget).toEqual({ kind: 'steps', limit: 6, used: 7, closingStep: false });
  });
});

function toolOf(name: string, extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    input: { type: 'object', properties: {} },
    execute: () => 'done',
    ...extra,
  };
}

function packOf(name: string, tools: string[]): PackRegistration {
  return registerPack(
    definePack({
      name,
      version: '1.0.0',
      description: `${name} pack`,
      meta: {
        tools: tools.map((tool) => ({ name: tool, description: tool })),
        skills: [],
        hasSettings: false,
      },
      create: () => ({ tools: tools.map((tool) => toolOf(tool)) }),
    }),
  );
}

function packOutput(reg: PackRegistration): PackRunOutput {
  const created = reg.pack.create({ ports: reg.ports ?? {}, spec: {}, scope: fallbackScope() });
  return {
    reg,
    config: {},
    tools: created.tools ?? [],
    skills: created.skills ?? [],
    notes: [],
  };
}

function fakeSkills(docs: Record<string, string>): SkillRegistry {
  return {
    list: () => Object.entries(docs).map(([name, description]) => ({ name, description })),
    load: (name: string) => {
      const instructions = docs[name];
      if (instructions === undefined) {
        throw new Error(`unknown skill: ${name}`);
      }
      return { name, description: name, instructions, files: [] };
    },
    loadFile: (name: string) => {
      throw new Error(`no files for skill: ${name}`);
    },
    reload: () => {},
  };
}

describe('spawn capability allowlists', () => {
  test('an explicit child packs map is an exact allowlist in a no-universe run', async () => {
    const filesReg = packOf('files', ['read_file', 'write_file']);
    const shellReg = packOf('shell', ['shell', 'terminal_open', 'port_forward', 'remote_copy']);
    const child: AgentDefinition = {
      ...CHILD,
      packs: { files: { disabledTools: ['write_file'] } },
    };
    const agents: AgentsResolve = {
      resolve: (id) => (id === child.id ? child : undefined),
      list: () => [{ id: child.id, name: child.id }],
    };
    const parent: GraphOpts = {
      ...parentOpts(
        fakeState(() => snapshot('completed')),
        undefined,
        agents,
      ),
      toolRegistry: new Map<string, ToolDefinition>([
        ['shell', toolOf('shell')],
        ['terminal_open', toolOf('terminal_open')],
        ['port_forward', toolOf('port_forward')],
        ['remote_copy', toolOf('remote_copy')],
        ['threads_history', toolOf('threads_history')],
        ['read_file', toolOf('read_file')],
        ['write_file', toolOf('write_file')],
      ]),
      packOutputs: new Map([
        [filesReg.pack.name, packOutput(filesReg)],
        [shellReg.pack.name, packOutput(shellReg)],
      ]),
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: child.id, input: 'task', budget: { maxSteps: 10 } }] },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    const registry = captured[0]?.toolRegistry;
    expect(registry?.has('read_file')).toBe(true);
    expect(registry?.has('load_tools')).toBe(true);
    expect(registry?.has('write_file')).toBe(false);
    expect(registry?.has('shell')).toBe(false);
    expect(registry?.has('terminal_open')).toBe(false);
    expect(registry?.has('port_forward')).toBe(false);
    expect(registry?.has('remote_copy')).toBe(false);
    expect(registry?.has('threads_history')).toBe(false);
    expect(registry?.has('load_skill')).toBe(false);
    expect(registry?.has('Skill')).toBe(false);
  });

  test('a core child in a no-universe run gets the core service trio', async () => {
    const coreReg = packOf('core', []);
    const filesReg = packOf('files', ['read_file']);
    const child: AgentDefinition = {
      ...CHILD,
      packs: { core: true, files: true },
    };
    const agents: AgentsResolve = {
      resolve: (id) => (id === child.id ? child : undefined),
      list: () => [{ id: child.id, name: child.id }],
    };
    const parent: GraphOpts = {
      ...parentOpts(
        fakeState(() => snapshot('completed')),
        undefined,
        agents,
      ),
      agent: { ...PARENT, skills: ['guide-a'] },
      skills: fakeSkills({ 'guide-a': 'GUIDE A BODY', hidden: 'HIDDEN BODY' }),
      toolRegistry: new Map<string, ToolDefinition>([
        ['read_file', toolOf('read_file')],
        ['threads_history', toolOf('threads_history')],
      ]),
      packOutputs: new Map([
        [coreReg.pack.name, packOutput(coreReg)],
        [filesReg.pack.name, packOutput(filesReg)],
      ]),
    };
    const prepared = prepareSpawn(node(), parent, {
      ...SLOTS,
      state: { spawns: [{ agentId: child.id, input: 'task', budget: { maxSteps: 10 } }] },
    });
    const captured: GraphOpts[] = [];
    await executeSpawn(prepared, parent, captureRunner(captured));
    const registry = captured[0]?.toolRegistry;
    expect(registry?.has('load_tools')).toBe(true);
    expect(registry?.has('load_skill')).toBe(true);
    expect(registry?.has('Skill')).toBe(true);
    expect(registry?.has('read_file')).toBe(true);
    expect(registry?.has('threads_history')).toBe(false);
    const load = registry?.get('load_skill');
    const allowed = await load?.execute({ name: 'guide-a' }, { cwd: '/', paths: { allow: [] } });
    expect(allowed).toEqual({ instructions: 'GUIDE A BODY', files: [] });
    const outside = await load?.execute({ name: 'hidden' }, { cwd: '/', paths: { allow: [] } });
    expect(outside).toMatchObject({ error: true, code: 'SKILL_NOT_ENABLED' });
  });
});
