import type { PackInventoryGroup, PackRegistration, PackToolInfo, ToolDefinition } from 'harnesys';
import { CORE_SERVICE_TOOLS, resolveCapabilitySet } from 'harnesys';

const INVENTORY_STUB_TOOL: ToolDefinition = {
  name: 'load_tools',
  description: 'pack inventory placeholder (never exposed)',
  input: { type: 'object', properties: {} },
  execute: () => ({ error: 'inventory-only' }),
};

export interface PackInventoryDeps {
  packRegistrations?: () => PackRegistration[];
  baseRegistry?: () => Map<string, ToolDefinition>;
}

export async function packInventoryOf(deps: PackInventoryDeps): Promise<PackInventoryGroup[]> {
  const registrations = deps.packRegistrations?.() ?? [];
  const baseRegistry = deps.baseRegistry?.() ?? new Map<string, ToolDefinition>();
  const packs: Record<string, true> = {};
  for (const registration of registrations) {
    packs[registration.pack.name] = true;
  }
  const def = {
    id: 'pack-inventory',
    prompts: {},
    packs,
    graph: {
      nodes: {
        start: { type: 'core:start' as const },
        end: { type: 'core:end' as const },
      },
      edges: [{ from: 'start', to: 'end' }],
    },
  };
  const set = resolveCapabilitySet(def, {
    registrations,
    baseRegistry,
    roster: [],
    makeLoadTools: () => INVENTORY_STUB_TOOL,
  });
  const groups = new Map<string, PackToolInfo[]>();
  for (const [name, entry] of set.registry) {
    if (CORE_SERVICE_TOOLS.includes(name)) {
      continue;
    }
    const tools = groups.get(entry.source) ?? [];
    tools.push({
      name,
      description: entry.def.description,
      ...(entry.def.sideEffect !== undefined ? { sideEffect: entry.def.sideEffect } : {}),
      ...(entry.def.operations !== undefined && entry.def.operations.length > 0
        ? { operations: entry.def.operations }
        : {}),
      ...(entry.def.interactive === true ? { interactive: true } : {}),
    });
    groups.set(entry.source, tools);
  }
  return [...groups].map(([source, tools]) => ({ source, tools }));
}
