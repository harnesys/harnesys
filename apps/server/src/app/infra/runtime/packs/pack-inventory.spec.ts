import { describe, expect, test } from 'bun:test';
import type { AgentDefinition, AgentPacks, PackRegistration, ToolDefinition } from 'harnesys';
import { definePack, registerPack } from 'harnesys';
import { packInventoryOf } from './pack-inventory.ts';

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

function agentOf(packs: AgentPacks): AgentDefinition {
  return {
    id: 'agent-1',
    prompts: {},
    packs,
    graph: {
      nodes: { start: { type: 'core:start' }, end: { type: 'core:end' } },
      edges: [{ from: 'start', to: 'end' }],
    },
  };
}

const FILES = packOf('files', ['read_file', 'write_file']);
const SHELL = packOf('shell', ['shell']);

describe('packInventoryOf', () => {
  test('without an agent every registered pack is listed untrimmed', async () => {
    const groups = await packInventoryOf({ packRegistrations: () => [FILES, SHELL] });
    const files = groups.find((group) => group.source === 'pack:files');
    expect(files?.tools.map((tool) => tool.name)).toEqual(['read_file', 'write_file']);
    expect(files?.disabled).toBeUndefined();
    expect(files?.enabled).toBeUndefined();
  });

  test('applies the agent disabledTools trim and marks unassigned packs', async () => {
    const groups = await packInventoryOf(
      { packRegistrations: () => [FILES, SHELL] },
      agentOf({ files: { disabledTools: ['write_file'] } }),
    );
    const files = groups.find((group) => group.source === 'pack:files');
    expect(files?.tools.map((tool) => tool.name)).toEqual(['read_file']);
    expect(files?.disabled).toEqual(['write_file']);
    expect(files?.enabled).toBe(true);
    const shell = groups.find((group) => group.source === 'pack:shell');
    expect(shell?.tools.map((tool) => tool.name)).toEqual(['shell']);
    expect(shell?.enabled).toBe(false);
    expect(shell?.disabled).toBeUndefined();
  });

  test('agent disallowedTools are reported in the disabled list of their source', async () => {
    const groups = await packInventoryOf(
      { packRegistrations: () => [FILES, SHELL] },
      { ...agentOf({ files: true }), disallowedTools: ['write_file'] },
    );
    const files = groups.find((group) => group.source === 'pack:files');
    expect(files?.tools.map((tool) => tool.name)).toEqual(['read_file']);
    expect(files?.disabled).toEqual(['write_file']);
    expect(files?.enabled).toBe(true);
  });
});
