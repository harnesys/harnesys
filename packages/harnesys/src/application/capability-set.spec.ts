import { describe, expect, test } from 'bun:test';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { AgentPacks, PackRegistration } from '../domain/pack.ts';
import { definePack, registerPack } from '../domain/pack.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { CapabilityUniverse, ModeCapabilityFields } from './capability-set.ts';
import { resolveCapabilitySet } from './capability-set.ts';
import { effectiveSkillRegistry } from './packs/pack-run.ts';
import { createLoadSkillTool } from './skills/create-load-skill-tool.ts';

function toolOf(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    group: 'test',
    operations: [],
    input: { type: 'object', properties: {} },
    execute: () => 'done',
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
      create: () => ({ tools: tools.map(toolOf) }),
    }),
  );
}

function universe(mode: ModeCapabilityFields | undefined): CapabilityUniverse {
  return {
    registrations: [packOf('alpha', ['alpha_a', 'alpha_b']), packOf('beta', ['beta_a'])],
    baseRegistry: new Map(),
    roster: [],
    makeLoadTools: () => toolOf('load_tools'),
    mode,
  };
}

function defWith(packs: AgentPacks): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: { main: { instructions: '' } },
    packs,
    graph: {
      nodes: {
        start: { type: 'core:start' },
        end: { type: 'core:end' },
      },
      edges: [{ from: 'start', to: 'end' }],
    },
  };
}

describe('resolveCapabilitySet mode exposure', () => {
  test('mode preload defers tools of packs the mode does not select', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: true, beta: true, core: true }),
      universe({ id: 'focused', packs: { alpha: true } }),
    );
    expect(set.registry.get('alpha_a')?.exposure).toBe('direct');
    expect(set.registry.get('beta_a')?.exposure).toBe('deferred');
  });

  test('per-tool direct override beats mode deferral when the mode selects the pack', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: { exposure: { alpha_a: 'deferred' } }, beta: true, core: true }),
      universe({ id: 'focused', packs: { alpha: true } }),
    );
    expect(set.registry.get('alpha_a')?.exposure).toBe('deferred');
  });

  test('a mode without pack selection changes nothing', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: true, core: true }),
      universe({ id: 'empty', packs: {} }),
    );
    expect(set.registry.get('alpha_a')?.exposure).toBe('direct');
  });

  test('mode disabledTools remove tools; mode exposure overrides win', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: true, beta: true, core: true }),
      universe({
        id: 'scoped',
        packs: { alpha: true, beta: true },
        disabledTools: ['alpha_b'],
        exposure: { beta_a: 'deferred' },
      }),
    );
    expect(set.registry.has('alpha_b')).toBe(false);
    expect(set.registry.get('beta_a')?.exposure).toBe('deferred');
  });
});

describe('resolveCapabilitySet pack skills', () => {
  test('load_skill resolves a skill carried by an enabled pack', async () => {
    const carrier = registerPack(
      definePack<Record<string, unknown>, Record<string, unknown>>({
        name: 'carrier',
        version: '1.0.0',
        description: 'carrier pack',
        meta: { tools: [], skills: ['carrier-guide'], hasSettings: false },
        create: () => ({
          skills: [{ name: 'carrier-guide', description: 'guide', body: 'CARRIER BODY' }],
        }),
      }),
    );
    const universe: CapabilityUniverse = {
      registrations: [carrier],
      baseRegistry: new Map(),
      roster: [],
      makeLoadTools: () => toolOf('load_tools'),
      makeLoadSkill: (packOutputs) => [
        createLoadSkillTool(
          effectiveSkillRegistry(defWith({ carrier: true }), undefined, packOutputs),
        ),
      ],
    };
    const set = resolveCapabilitySet(defWith({ carrier: true, core: true }), universe);
    const load = set.registry.get('load_skill');
    expect(load).toBeDefined();
    const result = await load?.def.execute(
      { name: 'carrier-guide' },
      { cwd: '/', paths: { allow: [] } },
    );
    expect(result).toEqual({ instructions: 'CARRIER BODY', files: [] });
  });

  test('without the pack the skill registry stays empty', async () => {
    const set = resolveCapabilitySet(defWith({ core: true }), {
      registrations: [],
      baseRegistry: new Map(),
      roster: [],
      makeLoadTools: () => toolOf('load_tools'),
      makeLoadSkill: (packOutputs) => [
        createLoadSkillTool(
          effectiveSkillRegistry(defWith({ carrier: true }), undefined, packOutputs),
        ),
      ],
    });
    const load = set.registry.get('load_skill');
    const result = await load?.def.execute(
      { name: 'carrier-guide' },
      { cwd: '/', paths: { allow: [] } },
    );
    expect(result).toMatchObject({ error: true, code: 'UNKNOWN_SKILL' });
  });
});

describe('core services without the core pack', () => {
  test('a deferred tool grants the child load_tools even with core off', () => {
    const set = resolveCapabilitySet(
      defWith({ core: false, alpha: { exposure: { alpha_a: 'deferred' } } }),
      universe(undefined),
    );
    expect(set.registry.has('load_tools')).toBe(true);
    expect(set.registry.get('alpha_a')?.exposure).toBe('deferred');
  });

  test('nothing to reveal and core off keeps the service list empty', () => {
    const set = resolveCapabilitySet(defWith({ core: false, alpha: true }), universe(undefined));
    expect(set.registry.has('load_tools')).toBe(false);
  });

  test('a declared skill list grants load_skill even with core off', () => {
    const def: AgentDefinition = { ...defWith({ core: false }), skills: ['some-skill'] };
    const set = resolveCapabilitySet(def, {
      ...universe(undefined),
      makeLoadSkill: () => [toolOf('load_skill')],
    });
    expect(set.registry.has('load_skill')).toBe(true);
    expect(set.registry.has('load_tools')).toBe(false);
  });
});

function opTool(name: string, operations: string[]): ToolDefinition {
  return { ...toolOf(name), operations };
}

function packOfTools(name: string, tools: ToolDefinition[]): PackRegistration {
  return registerPack(
    definePack({
      name,
      version: '1.0.0',
      description: `${name} pack`,
      meta: {
        tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
        skills: [],
        hasSettings: false,
      },
      create: () => ({ tools }),
    }),
  );
}

describe('resolveCapabilitySet context rules', () => {
  function contextUniverse(opts: {
    sandbox?: boolean;
    permissions?: PermissionMap;
    tools?: ToolDefinition[];
  }): CapabilityUniverse {
    return {
      registrations: [packOfTools('alpha', opts.tools ?? [opTool('shell', ['process'])])],
      baseRegistry: new Map<string, ToolDefinition>([
        ['wait', { ...toolOf('wait'), group: 'control', interactive: true }],
      ]),
      roster: [],
      makeLoadTools: () => toolOf('load_tools'),
      ...(opts.sandbox !== undefined ? { sandbox: opts.sandbox } : {}),
      ...(opts.permissions !== undefined ? { permissions: opts.permissions } : {}),
    };
  }

  test('interactive tools are hidden from sandboxed runs and explained', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: true, core: true }),
      contextUniverse({
        sandbox: true,
      }),
    );
    expect(set.registry.has('wait')).toBe(false);
    const entry = set.explain.filter((e) => e.item === 'wait').at(-1);
    expect(entry?.status).toBe('denied-by-universe');
    expect(entry?.reason).toContain('no user to answer');
  });

  test('interactive tools stay in runs that have a user', () => {
    const set = resolveCapabilitySet(defWith({ alpha: true, core: true }), contextUniverse({}));
    expect(set.registry.has('wait')).toBe(true);
  });

  test('denied operations hide their tools, ask keeps them', () => {
    const set = resolveCapabilitySet(
      defWith({ alpha: true, core: true }),
      contextUniverse({
        tools: [opTool('shell', ['process']), opTool('fetch', ['network'])],
        permissions: { process: 'deny', network: 'ask' },
      }),
    );
    expect(set.registry.has('shell')).toBe(false);
    const entry = set.explain.filter((e) => e.item === 'shell').at(-1);
    expect(entry?.status).toBe('denied-by-permission');
    expect(entry?.reason).toContain('cannot lift a deny');
    expect(set.registry.has('fetch')).toBe(true);
  });
});
