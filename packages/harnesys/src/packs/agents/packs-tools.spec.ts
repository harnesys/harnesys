import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type { AgentsCatalogPort, PackInventoryGroup } from '../../ports/agents-catalog.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { createAgentsTools } from './create-agents-tools.ts';

const ctx = {} as ToolContext;

const INVENTORY: PackInventoryGroup[] = [
  {
    source: 'pack:files',
    tools: [
      { name: 'read_file', description: 'read' },
      { name: 'write_file', description: 'write', sideEffect: 'write', operations: ['fs.write'] },
    ],
  },
  {
    source: 'host',
    tools: [{ name: 'wait', description: 'park', interactive: true }],
  },
];

function toolsWith(inventory: PackInventoryGroup[] | undefined) {
  const agents = {
    list: async () => [],
    get: async () => null,
    create: async () => {
      throw new Error('not used');
    },
    ...(inventory === undefined ? {} : { packInventory: async () => inventory }),
  } as AgentsCatalogPort;
  const deps = {
    agents,
    resolveScope: (): CapabilityScope => ({
      orgId: 'org-1',
      agentId: 'caller-1',
      sourceIds: [],
      threadId: 'thread-1',
    }),
  };
  const tool = createAgentsTools(deps).find((row) => row.name === 'packs_tools');
  if (!tool) {
    throw new Error('packs_tools tool missing');
  }
  return tool;
}

describe('packs_tools', () => {
  test('returns grouped inventory with totals', async () => {
    const out = (await toolsWith(INVENTORY).execute({}, ctx)) as {
      sources: PackInventoryGroup[];
      totals: { tools: number };
    };
    expect(out.totals.tools).toBe(3);
    expect(out.sources.find((g) => g.source === 'pack:files')?.tools).toHaveLength(2);
  });

  test('filters by bare pack name', async () => {
    const out = (await toolsWith(INVENTORY).execute({ pack: 'files' }, ctx)) as {
      sources: PackInventoryGroup[];
    };
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]?.source).toBe('pack:files');
  });

  test('errors when the port has no inventory', async () => {
    const out = (await toolsWith(undefined).execute({}, ctx)) as { error?: string };
    expect(out.error).toContain('not available');
  });
});
