import type {
  AgentDefinition,
  AgentPacks,
  CapabilitySet,
  PackInventoryGroup,
  PackRegistration,
  ToolDefinition,
} from 'harnesys';
import { CORE_SERVICE_TOOLS, isOn, PACK_PREFIX, resolveCapabilitySet } from 'harnesys';

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

function inventoryPacks(
  registrations: PackRegistration[],
  agent: AgentDefinition | undefined,
): AgentPacks {
  const packs: AgentPacks = {};
  for (const registration of registrations) {
    const name = registration.pack.name;
    const assignment = agent?.packs?.[name];
    packs[name] =
      assignment === undefined || assignment === null || assignment === false ? true : assignment;
  }
  return packs;
}

function inventoryDef(
  registrations: PackRegistration[],
  agent: AgentDefinition | undefined,
): AgentDefinition {
  return {
    id: 'pack-inventory',
    prompts: {},
    packs: inventoryPacks(registrations, agent),
    ...(agent?.mcpServers !== undefined ? { mcpServers: agent.mcpServers } : {}),
    ...(agent?.disallowedTools !== undefined ? { disallowedTools: agent.disallowedTools } : {}),
    graph: {
      nodes: {
        start: { type: 'core:start' as const },
        end: { type: 'core:end' as const },
      },
      edges: [{ from: 'start', to: 'end' }],
    },
  };
}

function collectGroups(set: CapabilitySet): Map<string, PackInventoryGroup> {
  const groups = new Map<string, PackInventoryGroup>();
  for (const [name, entry] of set.registry) {
    if (CORE_SERVICE_TOOLS.includes(name)) {
      continue;
    }
    const group = groups.get(entry.source) ?? { source: entry.source, tools: [] };
    group.tools.push({
      name,
      description: entry.def.description,
      ...(entry.def.sideEffect !== undefined ? { sideEffect: entry.def.sideEffect } : {}),
      ...(entry.def.operations !== undefined && entry.def.operations.length > 0
        ? { operations: entry.def.operations }
        : {}),
      ...(entry.def.interactive === true ? { interactive: true } : {}),
    });
    groups.set(entry.source, group);
  }
  return groups;
}

function annotateAgentView(
  groups: Map<string, PackInventoryGroup>,
  set: CapabilitySet,
  agent: AgentDefinition,
): void {
  for (const entry of set.explain) {
    if (entry.kind !== 'tool' || entry.status !== 'disabled') {
      continue;
    }
    const group = groups.get(entry.source) ?? { source: entry.source, tools: [] };
    group.disabled = [...(group.disabled ?? []), entry.item];
    groups.set(entry.source, group);
  }
  for (const group of groups.values()) {
    if (!group.source.startsWith(PACK_PREFIX)) {
      continue;
    }
    const assignment = agent.packs?.[group.source.slice(PACK_PREFIX.length)];
    group.enabled = isOn(assignment);
  }
}

export async function packInventoryOf(
  deps: PackInventoryDeps,
  agent?: AgentDefinition,
): Promise<PackInventoryGroup[]> {
  const registrations = deps.packRegistrations?.() ?? [];
  const set = resolveCapabilitySet(inventoryDef(registrations, agent), {
    registrations,
    baseRegistry: deps.baseRegistry?.() ?? new Map<string, ToolDefinition>(),
    roster: [],
    makeLoadTools: () => INVENTORY_STUB_TOOL,
  });
  const groups = collectGroups(set);
  if (agent !== undefined) {
    annotateAgentView(groups, set, agent);
  }
  return [...groups.values()];
}
