import { describe, expect, test } from 'bun:test';
import type { ToolDefinition } from '../../ports/tools.ts';
import { LOAD_TOOLS_NAME, resolveProgressiveTools } from './exposure.ts';

function def(name: string, exposure?: 'direct' | 'deferred'): ToolDefinition {
  return {
    name,
    description: `${name} desc`,
    input: { type: 'object' },
    exposure,
    execute: () => undefined,
  };
}

function registryOf(...defs: ToolDefinition[]): Map<string, ToolDefinition> {
  return new Map(defs.map((d) => [d.name, d]));
}

describe('resolveProgressiveTools', () => {
  test('all-direct resolved list passes through unchanged', () => {
    const registry = registryOf(def('a'), def('b'));
    const out = resolveProgressiveTools(['a', 'b'], registry, []);
    expect(out.toolNames).toEqual(['a', 'b']);
    expect(out.deferredPending).toEqual([]);
  });

  test('deferred tools are withheld until loaded', () => {
    const registry = registryOf(def('a'), def('browser', 'deferred'), def(LOAD_TOOLS_NAME));
    const out = resolveProgressiveTools(['a', 'browser', LOAD_TOOLS_NAME], registry, []);
    expect(out.deferredPending).toEqual(['browser']);
    expect(out.toolNames).toEqual(['a', LOAD_TOOLS_NAME]);
  });

  test('loaded deferred tools return to the model under graph allowlist', () => {
    const registry = registryOf(def('a'), def('browser', 'deferred'), def(LOAD_TOOLS_NAME));
    const out = resolveProgressiveTools(['a', LOAD_TOOLS_NAME], registry, ['browser']);
    expect(out.toolNames).toEqual(['a', LOAD_TOOLS_NAME, 'browser']);
    expect(out.deferredPending).toEqual([]);
  });

  test('loaded names outside the registry are ignored', () => {
    const registry = registryOf(def('a'), def(LOAD_TOOLS_NAME));
    const out = resolveProgressiveTools(['a'], registry, ['ghost']);
    expect(out.toolNames).toEqual(['a']);
  });

  test('load_tools is appended when the agent grants it but node omits it', () => {
    const registry = registryOf(def('a'), def('browser', 'deferred'), def(LOAD_TOOLS_NAME));
    const out = resolveProgressiveTools(['a', 'browser'], registry, []);
    expect(out.toolNames).toEqual(['a', LOAD_TOOLS_NAME]);
  });

  test('without load_tools grant nothing is deferred', () => {
    const registry = registryOf(def('a'), def('browser', 'deferred'));
    const out = resolveProgressiveTools(['a', 'browser'], registry, []);
    expect(out.deferredPending).toEqual([]);
    expect(out.toolNames).toEqual(['a', 'browser']);
  });
});
