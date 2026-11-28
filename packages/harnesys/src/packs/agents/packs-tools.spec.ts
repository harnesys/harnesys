import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  AgentsCatalogPort,
  PackInventoryGroup,
  PackToolInfo,
} from '../../ports/agents-catalog.ts';
import type { ToolContext } from '../../ports/tools.ts';
import { createAgentsTools } from './create-agents-tools.ts';

const ctx = {} as ToolContext;

interface ListedSource {
  source: string;
  tools: string[] | PackToolInfo[];
  enabled?: boolean;
  disabled?: string[];
}

function sourcesOf(out: unknown): ListedSource[] {
  return (out as { sources: ListedSource[] }).sources;
}

const INVENTORY: PackInventoryGroup[] = [
  {
    source: 'pack:files',
    tools: [
      { name: 'read_file', description: 'reads the file from disk' },
      {
        name: 'write_file',
        description: 'writes the file to disk',
        sideEffect: 'write',
        operations: ['fs.write'],
      },
    ],
  },
  {
    source: 'host',
    tools: [{ name: 'wait', description: 'parks the run until resumed', interactive: true }],
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
      sources: ListedSource[];
      totals: { sources: number; tools: number };
    };
    expect(out.totals).toEqual({ sources: 2, tools: 3 });
    expect(out.sources.find((g) => g.source === 'pack:files')?.tools).toHaveLength(2);
  });

  test('default shape is compact: tool names only, no description prose', async () => {
    const out = await toolsWith(INVENTORY).execute({}, ctx);
    expect(sourcesOf(out)[0]?.tools).toEqual(['read_file', 'write_file']);
    const json = JSON.stringify(out);
    expect(json).not.toContain('reads the file');
    expect(json).not.toContain('writes the file');
    expect(json).not.toContain('parks the run');
  });

  test('pack filter scopes the result and returns full tool objects', async () => {
    const out = await toolsWith(INVENTORY).execute({ pack: 'files' }, ctx);
    const sources = sourcesOf(out);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.source).toBe('pack:files');
    const tools = sources[0]?.tools as PackToolInfo[];
    expect(tools[0]).toEqual({ name: 'read_file', description: 'reads the file from disk' });
    expect(tools[1]?.sideEffect).toBe('write');
    expect(tools[1]?.operations).toEqual(['fs.write']);
  });

  test('detail:true returns full tool objects for every source', async () => {
    const out = await toolsWith(INVENTORY).execute({ detail: true }, ctx);
    const sources = sourcesOf(out);
    expect(sources).toHaveLength(2);
    const tools = sources[1]?.tools as PackToolInfo[];
    expect(tools[0]?.description).toBe('parks the run until resumed');
    expect(tools[0]?.interactive).toBe(true);
  });

  test('defaults to the caller scope and forwards agentId into the inventory scope', async () => {
    const trimmed: PackInventoryGroup[] = [
      {
        source: 'pack:files',
        tools: [{ name: 'read_file', description: 'reads the file from disk' }],
        enabled: true,
        disabled: ['write_file'],
      },
    ];
    const seen: CapabilityScope[] = [];
    const tool = toolsWith(trimmed, seen);
    const own = await tool.execute({}, ctx);
    expect(seen[0]?.agentId).toBe('caller-1');
    expect(sourcesOf(own)[0]?.disabled).toEqual(['write_file']);
    expect(sourcesOf(own)[0]?.enabled).toBe(true);
    const out = await tool.execute({ agentId: 'delegate-9' }, ctx);
    expect(seen[1]?.agentId).toBe('delegate-9');
    expect(seen[1]?.orgId).toBe('org-1');
    expect(sourcesOf(out)[0]?.source).toBe('pack:files');
  });

  test('errors when the port has no inventory', async () => {
    const out = (await toolsWith(undefined).execute({}, ctx)) as { error?: string };
    expect(out.error).toContain('not available');
  });
});
