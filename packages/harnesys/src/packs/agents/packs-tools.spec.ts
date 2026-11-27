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

function toolsWith(inventory: PackInventoryGroup[] | undefined, seen?: CapabilityScope[]) {
  const agents = {
    list: async () => [],
    get: async () => null,
    create: async () => {
      throw new Error('not used');
    },
    ...(inventory === undefined
      ? {}
      : {
          packInventory: async (scope?: CapabilityScope) => {
            if (scope !== undefined) {
              seen?.push(scope);
            }
            return inventory;
          },
        }),
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

  test('defaults to the caller scope and forwards agentId into the inventory scope', async () => {
    const trimmed: PackInventoryGroup[] = [
      {
        source: 'pack:files',
        tools: [{ name: 'read_file', description: 'read' }],
        enabled: true,
        disabled: ['write_file'],
      },
    ];
    const seen: CapabilityScope[] = [];
    const tool = toolsWith(trimmed, seen);
    const own = (await tool.execute({}, ctx)) as { sources: PackInventoryGroup[] };
    expect(seen[0]?.agentId).toBe('caller-1');
    expect(own.sources[0]?.disabled).toEqual(['write_file']);
    expect(own.sources[0]?.enabled).toBe(true);
    const out = (await tool.execute({ agentId: 'delegate-9' }, ctx)) as {
      sources: PackInventoryGroup[];
    };
    expect(seen[1]?.agentId).toBe('delegate-9');
    expect(seen[1]?.orgId).toBe('org-1');
    expect(out.sources[0]?.source).toBe('pack:files');
  });

  test('errors when the port has no inventory', async () => {
    const out = (await toolsWith(undefined).execute({}, ctx)) as { error?: string };
    expect(out.error).toContain('not available');
  });
});
