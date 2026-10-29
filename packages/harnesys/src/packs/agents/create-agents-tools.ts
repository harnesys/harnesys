import { ENTITY_COLOR_NAMES } from '@harnesys/contracts';
import { type CapabilityScope, type PackConfig, packsShapeError } from '../../domain/pack.ts';
import type {
  AgentCatalogCreateInput,
  AgentCatalogSummary,
  AgentsCatalogPort,
} from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { parseAgentColor } from './agent-color.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';
import { spawnAgentTool } from './spawn-agents-tool.ts';
export interface CreateAgentsToolsParams {
  agents: AgentsCatalogPort;
  resolveScope: () => CapabilityScope;
}
async function withInheritedModel(
  agents: AgentsCatalogPort,
  scope: CapabilityScope,
  input: AgentCatalogCreateInput,
): Promise<AgentCatalogCreateInput> {
  if (input.model !== undefined) {
    return input;
  }
  const creator = await agents.get(scope, scope.agentId);
  return creator?.model ? { ...input, model: creator.model } : input;
}
interface AgentsListInput {
  role?: string;
  name?: string;
}
interface CreateInputRaw {
  name?: string;
  role?: string;
  instructions?: string;
  packs?: Record<string, PackConfig | null>;
  capabilities?: Record<string, PackConfig | null>;
}
function requiredFieldsError(input: CreateInputRaw): { error: string } | null {
  if (!input.name || !input.role || !input.instructions) {
    return { error: 'name, role, and instructions are required' };
  }
  return null;
}
function packsShapeFailure(packs: unknown): { error: string } | null {
  const shapeError = packsShapeError(packs);
  if (shapeError === null) {
    return null;
  }
  return { error: shapeError };
}
function subagentPacksFailure(
  packMap: Record<string, PackConfig | null> | undefined,
): { error: string } | null {
  if (packMap === undefined) {
    return null;
  }
  const invalidPacks = packsShapeFailure(packMap);
  if (invalidPacks !== null) {
    return invalidPacks;
  }
  const ag: unknown = packMap.agents;
  if (ag !== undefined && ag !== null && ag !== false) {
    return { error: 'packs.agents is forbidden for subagents (nesting ban)' };
  }
  return null;
}
interface PreparedCreateInput {
  input: AgentCatalogCreateInput;
  error?: string;
}
function prepareCreateInput(
  raw: AgentCatalogCreateInput & { capabilities?: Record<string, PackConfig | null> },
  packs: Record<string, PackConfig | null> | undefined,
  parentId?: string,
): PreparedCreateInput {
  const check = parseAgentColor(raw.color);
  const next: AgentCatalogCreateInput & { capabilities?: unknown } = {
    ...raw,
    ...(parentId !== undefined ? { parentId } : {}),
    ...(check.color !== undefined ? { color: check.color } : {}),
    ...(packs !== undefined ? { packs } : {}),
  };
  delete next.capabilities;
  return { input: next, error: check.error };
}
function rowLevel(row: { plugin?: boolean; parentId?: string | null }) {
  if (row.plugin) {
    return 'plugin';
  }
  return row.parentId ? 'delegate' : 'top';
}
async function agentListEntry(
  deps: CreateAgentsToolsParams,
  scope: CapabilityScope,
  row: AgentCatalogSummary,
  parentNames: Map<string, string>,
): Promise<Record<string, unknown>> {
  const def = await deps.agents.get(scope, row.id);
  const enabledPlugins = Object.keys(def?.enabledPlugins ?? {}).filter(
    (name) => def?.enabledPlugins?.[name],
  );
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    instructions: row.instructions,
    packs: Object.keys(def?.packs ?? {}).filter((name) => def?.packs?.[name]),
    ...(def?.skills?.length ? { skills: def.skills } : {}),
    ...(def?.mcpServers?.length ? { mcpServers: def.mcpServers } : {}),
    ...(def?.disallowedTools?.length ? { disallowedTools: def.disallowedTools } : {}),
    ...(enabledPlugins.length > 0 ? { enabledPlugins } : {}),
    ...(def?.budget !== undefined ? { budget: def.budget } : {}),
    ...(def?.permissions !== undefined ? { permissions: def.permissions } : {}),
    ...(def?.model ? { model: `${def.model.provider}/${def.model.model}` } : {}),
    ...(row.color !== undefined ? { color: row.color } : {}),
    level: rowLevel(row),
    ...(row.parentId ? { parent: parentNames.get(row.parentId) ?? row.parentId } : {}),
  };
}
export function createAgentsTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  return [
    tool('agents_list', {
      group: 'agents',
      description:
        'List agents in this project with their full configuration: id, name, role, instructions, packs, skills, mcpServers, disallowedTools, enabledPlugins, budget, permissions, model, color, level top|delegate|plugin, parent?. Optional role/name filters; role is not unique. packs/skills/mcpServers list enabled sources per agent; tool availability derives from those sources. permissions are read-only here (UI-managed). Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by packs/model before agents_spawn.',
      input: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Filter by role (exact match)' },
          name: { type: 'string', description: 'Filter by name (exact match)' },
        },
      },
      execute: async (raw, execCtx) =>
        runGuard(async () => {
          const scope = scopeFor(deps, execCtx);
          const input = (raw ?? {}) as AgentsListInput;
          const filter =
            input.role !== undefined || input.name !== undefined
              ? { role: input.role, name: input.name }
              : undefined;
          const rows = await deps.agents.list(scope, filter);
          const parentNames = new Map(rows.map((row) => [row.id, row.name]));
          return await Promise.all(
            rows.map((row) => agentListEntry(deps, scope, row, parentNames)),
          );
        }),
    }),
    tool('agents_create', {
      group: 'agents',
      operations: ['agents'],
      description:
        'Create a standalone top-level agent in this project (visible to the user in the sidebar, own threads). For a delegate under you use agents_create_subagent. Returns the full row: { id, name, role, instructions, parentId, packs, model?, budget?, permissions? }. Before creating, load_skill("agent-creator") for graphs, packs, budget, and HITL. Omit graph to let the host build a default ReAct graph; when budget is omitted the host stores { maxSteps: 50, policy: "ask" }. budget.policy is ask|error. skills/mcpServers/packs/enabledPlugins: sources, not tool names; omitted or [] means none; list every source explicitly. Call agents_list first to reuse an existing agent when possible.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name' },
          role: { type: 'string', description: 'Role label (not unique)' },
          instructions: { type: 'string', description: 'System instructions for the agent' },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skill names to attach',
          },
          mcpServers: {
            type: 'array',
            items: { type: 'string' },
            description: 'MCP server names to attach',
          },
          budget: {
            type: 'object',
            description:
              'Run budget. Default ReAct is cyclic: omit graph+budget and the host stores { maxSteps: 50, policy: "ask" }. policy is ask|error.',
            properties: {
              maxSteps: { type: 'integer', minimum: 1 },
              maxTokens: { type: 'integer', minimum: 1 },
              deadlineMs: { type: 'integer', minimum: 1 },
              policy: { type: 'string', enum: ['ask', 'error'] },
            },
          },
          packs: {
            type: 'object',
            description: 'Optional pack map (name → true | config | null); sources, not tool names',
          },
          capabilities: {
            type: 'object',
            description: 'Deprecated alias of packs; packs wins when both are present',
          },
          graph: {
            type: 'object',
            description: 'Optional custom graph; omit for host default ReAct',
          },
          color: {
            type: 'string',
            description: `Optional avatar color, one of: ${ENTITY_COLOR_NAMES.join(', ')} (same palette as the user interface swatches).`,
          },
          model: {
            type: 'object',
            description: 'Optional model ref (provider, model, effort, generation)',
          },
        },
        required: ['name', 'role', 'instructions'],
      },
      execute: async (raw, execCtx) =>
        runGuard(async () => {
          const scope = scopeFor(deps, execCtx);
          const input = raw as AgentCatalogCreateInput & {
            capabilities?: Record<string, PackConfig | null>;
          };
          const missing = requiredFieldsError(input);
          if (missing !== null) {
            return missing;
          }
          const prepared = prepareCreateInput(input, input.packs ?? input.capabilities ?? {});
          if (prepared.error !== undefined) {
            return { error: prepared.error };
          }
          return await deps.agents.create(
            scope,
            await withInheritedModel(deps.agents, scope, prepared.input),
          );
        }),
    }),
    tool('agents_create_subagent', {
      group: 'agents',
      operations: ['agents'],
      description:
        'Create a subagent delegate under YOU (the calling agent). ' +
        'Returns the full row: { id, name, role, instructions, parentId, packs, model?, budget?, permissions? }. ' +
        'skills/mcpServers/packs/enabledPlugins: sources, not tool names; omitted or [] means none; list every source explicitly. ' +
        'Delegates are one-shot spawn targets: they cannot ask the user questions, their permissions ' +
        'never exceed yours, and the "agents" pack is forbidden for them. Spawn them with agents_spawn. ' +
        'Use agents_create instead for a standalone project agent visible to the user.',
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Display name' },
          role: { type: 'string', description: 'Role label (not unique)' },
          instructions: { type: 'string', description: 'System instructions for the subagent' },
          skills: {
            type: 'array',
            items: { type: 'string' },
            description: 'Skill names to attach',
          },
          packs: {
            type: 'object',
            description: 'Optional pack map (name → true | config | null); "agents" is rejected',
          },
          budget: {
            type: 'object',
            description: 'Run budget; use policy "error" (ask is unavailable in spawn)',
            properties: {
              maxSteps: { type: 'integer', minimum: 1 },
              maxTokens: { type: 'integer', minimum: 1 },
              deadlineMs: { type: 'integer', minimum: 1 },
              policy: { type: 'string', enum: ['ask', 'error'] },
            },
          },
          permissions: {
            type: 'object',
            description:
              'Permission map op → allow|ask|deny (fs.read, fs.write, process, network, mcp). Effective rights are intersected with yours; ask acts as deny in spawn.',
          },
          graph: {
            type: 'object',
            description: 'Optional custom graph; omit for host default ReAct',
          },
          color: {
            type: 'string',
            description: `Optional avatar color, one of: ${ENTITY_COLOR_NAMES.join(', ')} (same palette as the user interface swatches).`,
          },
        },
        required: ['name', 'role', 'instructions'],
      },
      execute: async (raw, execCtx) =>
        runGuard(async () => {
          const scope = scopeFor(deps, execCtx);
          const input = raw as AgentCatalogCreateInput & {
            capabilities?: Record<string, PackConfig | null>;
          };
          const missing = requiredFieldsError(input);
          if (missing !== null) {
            return missing;
          }
          const packMap = input.packs ?? input.capabilities;
          const packFailure = subagentPacksFailure(packMap);
          if (packFailure !== null) {
            return packFailure;
          }
          const prepared = prepareCreateInput(input, packMap, scope.agentId);
          if (prepared.error !== undefined) {
            return { error: prepared.error };
          }
          return await deps.agents.create(
            scope,
            await withInheritedModel(deps.agents, scope, prepared.input),
          );
        }),
    }),
    spawnAgentTool(deps),
  ];
}
