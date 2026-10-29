import { describe, expect, test } from 'bun:test';
import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { AgentPacks, PackRegistration } from '../domain/pack.ts';
import { definePack, registerPack } from '../domain/pack.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import type { CapabilityUniverse, ModeCapabilityFields } from './capability-set.ts';
import { resolveCapabilitySet } from './capability-set.ts';

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
