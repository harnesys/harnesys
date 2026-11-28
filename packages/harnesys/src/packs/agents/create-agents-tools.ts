import { ENTITY_COLOR_NAMES } from '@harnesys/contracts';
import type { AgentDefinition, AgentModelRef } from '../../domain/agent-definition.ts';
import { type CapabilityScope, type PackConfig, packsShapeError } from '../../domain/pack.ts';
import type {
  AgentCatalogCreateInput,
  AgentCatalogModel,
  AgentCatalogSummary,
  AgentsCatalogPort,
} from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { parseAgentColor } from './agent-color.ts';
import { permissionsAskGate } from './agent-permissions.ts';
import { BUDGET_TUNING_TEXT, budgetJsonSchema } from './budget-json-schema.ts';
import { createPacksToolsTool } from './packs-tools-tool.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';
import { spawnAgentTool } from './spawn-agents-tool.ts';
export interface CreateAgentsToolsParams {
  agents: AgentsCatalogPort;
  resolveScope: () => CapabilityScope;
  ownDelegatesOnly?: boolean;
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
  verbose?: boolean;
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
function catalogModel(model: AgentModelRef): AgentCatalogModel {
  return {
    provider: model.provider,
    model: model.model,
    ...(model.effort ? { effort: model.effort } : {}),
  };
}
interface AgentListEntryInput {
  deps: CreateAgentsToolsParams;
  scope: CapabilityScope;
  row: AgentCatalogSummary;
  parentNames: Map<string, string>;
  withInstructions: boolean;
  prefetched: AgentDefinition | null | undefined;
}
async function agentListEntry(input: AgentListEntryInput): Promise<Record<string, unknown>> {
  const { deps, scope, row, parentNames, withInstructions, prefetched } = input;
  const def = prefetched !== undefined ? prefetched : await deps.agents.get(scope, row.id);
  const enabledPlugins = Object.keys(def?.enabledPlugins ?? {}).filter(
    (name) => def?.enabledPlugins?.[name],
  );
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    ...(withInstructions ? { instructions: row.instructions } : {}),
    packs: Object.keys(def?.packs ?? {}).filter((name) => def?.packs?.[name]),
    ...(def?.skills?.length ? { skills: def.skills } : {}),
    ...(def?.mcpServers?.length ? { mcpServers: def.mcpServers } : {}),
    ...(def?.disallowedTools?.length ? { disallowedTools: def.disallowedTools } : {}),
    ...(enabledPlugins.length > 0 ? { enabledPlugins } : {}),
    ...(def?.budget !== undefined ? { budget: def.budget } : {}),
    ...(def?.permissions !== undefined ? { permissions: def.permissions } : {}),
    ...(def?.model ? { model: catalogModel(def.model) } : {}),
    ...(row.color !== undefined ? { color: row.color } : {}),
    level: rowLevel(row),
    ...(row.parentId ? { parent: parentNames.get(row.parentId) ?? row.parentId } : {}),
  };
}
export function createAgentsTools(deps: CreateAgentsToolsParams): ToolDefinition[] {
  return [
    createPacksToolsTool(deps),
    tool('agents_list', {
      group: 'agents',
      description:
        "List agents in this project: id, name, role, packs, skills, mcpServers, disallowedTools, enabledPlugins, budget, permissions, model {provider, model, effort?}, color, level top|delegate|plugin, parent?. instructions are omitted by default; they are returned in full when a role/name filter isolates a single agent or with verbose: true. Optional role/name filters (exact match); role is not unique. packs/skills/mcpServers list enabled sources per agent; tool availability derives from those sources — a spawned child can call exactly its own enabled packs (with their disabledTools/exposure trims applied) and, through its own mcpServers, parent-side MCP tools; it never inherits the spawner's pack tools. Core service tools (load_tools/load_skill/Skill) are added when the child's core pack is on. Spawns from a thread's main run additionally carry host run-context tools (e.g. threads_history) that no pack manages; placed/fleet-run spawns never inherit those, and there load_tools is always available, even without core. permissions are shown read-only here; patch them via agents_update (requires user approval) or the project UI. Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by packs/model before agents_spawn. Call packs_tools to see the concrete tools a pack would grant before assigning it.",
      input: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Filter by role (exact match)' },
          name: { type: 'string', description: 'Filter by name (exact match)' },
          verbose: {
            type: 'boolean',
            description:
              "Include each agent's full instructions text. Default false omits instructions.",
          },
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
          const withInstructions =
            input.verbose === true || (filter !== undefined && rows.length === 1);
          const definitions =
            deps.agents.listDefinitions !== undefined
              ? new Map(
                  (await deps.agents.listDefinitions(scope)).map((item) => [
                    item.id,
                    item.definition,
                  ]),
                )
              : undefined;
          return await Promise.all(
            rows.map((row) =>
              agentListEntry({
                deps,
                scope,
                row,
                parentNames,
                withInstructions,
                prefetched:
                  definitions === undefined ? undefined : (definitions.get(row.id) ?? null),
              }),
            ),
          );
        }),
    }),
    tool('agents_create', {
      group: 'agents',
      operations: ['agents'],
      description:
        'Create a standalone top-level agent in this project (visible to the user in the sidebar, own threads). For a delegate under you use agents_create_subagent. Returns the full row: { id, name, role, instructions, parentId, packs, packsConfig?, model? {provider, model, effort?}, budget?, permissions? }; packsConfig echoes the exact assignment per pack (true or the { spec?, disabledTools?, exposure? } map) — verify your trim landed there before spawning. Before creating, load_skill("agent-creator") for graphs, packs, budget, and HITL. Compose the toolset per role, not by habit: check packs_tools for what a pack actually carries, grant the minimal packs, and trim with object assignments like packs: { files: { disabledTools: ["write_file", "edit_file"] } } for a read-only reviewer — unused tools cost tokens every step and invite wrong calls. Omit graph to let the host build a default ReAct graph; when budget is omitted the host stores { maxSteps: 50, policy: "ask" }. budget.policy is ask|error; budget also accepts the tuning fields warnAtSteps, closeOnExhaustion, extendDefaultPct and rejects anything else. skills/mcpServers/packs/enabledPlugins: sources, not tool names; omitted or [] means none; list every source explicitly. Passing permissions requires user approval. Call agents_list first to reuse an existing agent when possible.',
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
          budget: budgetJsonSchema({
            policyEnum: ['ask', 'error'],
            description:
              'Run budget. Default ReAct is cyclic: omit graph+budget and the host stores { maxSteps: 50, policy: "ask" }. policy is ask|error. ' +
              BUDGET_TUNING_TEXT,
          }),
          packs: {
            type: 'object',
            description:
              "Pack map (name → true | { spec?, disabledTools?, exposure? } | null); sources, not tool names. Use { disabledTools: [...] } to drop individual tools a pack carries and { exposure: { tool: \"deferred\" } } to hide tools from the system prompt until load_tools reveals them; check contents with packs_tools. For spawned (delegated) runs this map is the exact allowlist of pack tools — the child never inherits the spawner's pack tools. Outside the map: spawns from a thread's main run get core service tools (load_tools/load_skill/Skill) when the core pack is on, plus host run-context tools (e.g. threads_history) that no pack manages; placed/fleet-run spawns get no host run-context tools — there load_tools is always added and load_skill/Skill only when the core pack is on — and each spawn may only call parent-side MCP tools whose server is in the child's own mcpServers.",
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
          permissions: {
            type: 'object',
            description:
              'Permission map op → allow|ask|deny (fs.read, fs.write, process, network, mcp, agents); requires user approval',
            additionalProperties: { type: 'string', enum: ['allow', 'ask', 'deny'] },
          },
        },
        required: ['name', 'role', 'instructions'],
      },
      gate: permissionsAskGate,
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
        'Returns the full row: { id, name, role, instructions, parentId, packs, packsConfig?, model? {provider, model, effort?}, budget?, permissions? }; packsConfig echoes the exact assignment per pack (true or the { spec?, disabledTools?, exposure? } map) — verify your trim landed there before spawning. ' +
        'skills/mcpServers/packs/enabledPlugins: sources, not tool names; omitted or [] means none; list every source explicitly. ' +
        'Compose the toolset per task, not per habit: check packs_tools for what a pack carries, enable the minimal set, ' +
        'and trim with object assignments like packs: { files: { disabledTools: ["delete_file"] } } — ' +
        'unused tools still cost tokens every step and invite wrong calls. ' +
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
            description:
              'Pack map (name → true | { spec?, disabledTools?, exposure? } | null); "agents" is rejected. disabledTools drops individual tools a pack would grant; exposure "deferred" hides a tool until load_tools. This map is the exact allowlist of pack tools for the delegate: when spawned it can call only its enabled packs (trims applied) and parent-side MCP tools whose server is in its own mcpServers. Core service tools (load_tools/load_skill/Skill) come with the core pack; host run-context tools (e.g. threads_history) attach only to spawns from a thread\'s main run — placed/fleet-run spawns never inherit them, and there load_tools is available even without core. See packs_tools.',
          },
          budget: budgetJsonSchema({
            policyEnum: ['error'],
            description: `Run budget; policy is "error" (ask is unavailable in spawn). ${BUDGET_TUNING_TEXT}`,
          }),
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
