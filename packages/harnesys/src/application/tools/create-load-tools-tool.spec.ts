import { describe, expect, test } from 'bun:test';
import type { ToolDefinition } from '../../ports/tools.ts';
import { tool } from '../../ports/tools.ts';
import { createLoadToolsTool } from './create-load-tools-tool.ts';

function echoDef(name: string): ToolDefinition {
  return tool(name, {
    description: `def of ${name}`,
    exposure: 'deferred',
    input: { type: 'object', properties: {} },
    execute: () => ({ ok: true }),
  });
}

describe('createLoadToolsTool', () => {
  test('resolves unknown names through discover and registers them', () => {
    const registry = new Map<string, ToolDefinition>();
    const load = createLoadToolsTool(registry, {
      discover: (name) => (name === 'everything__echo' ? echoDef(name) : undefined),
    });
    const result = load.execute({ names: ['everything__echo'] }) as {
      loaded: string[];
      unknown: string[];
      tools: Array<{ name: string }>;
    };
    expect(result.loaded).toEqual(['everything__echo']);
    expect(result.unknown).toEqual([]);
    expect(registry.has('everything__echo')).toBe(true);
  });

  test('keeps names unknown when discover has no match', () => {
    const registry = new Map<string, ToolDefinition>();
    const load = createLoadToolsTool(registry, { discover: () => undefined });
    const result = load.execute({ names: ['nope'] }) as { loaded: string[]; unknown: string[] };
    expect(result.unknown).toEqual(['nope']);
    expect(registry.has('nope')).toBe(false);
  });

  test('without discover behaves as before', () => {
    const registry = new Map<string, ToolDefinition>();
    registry.set('known', echoDef('known'));
    const load = createLoadToolsTool(registry);
    const result = load.execute({ names: ['known', 'ghost'] }) as {
      loaded: string[];
      unknown: string[];
    };
    expect(result.loaded).toEqual(['known']);
    expect(result.unknown).toEqual(['ghost']);
  });
});
