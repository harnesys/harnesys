import { resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import type { AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import { permissionsAskGate } from './agent-permissions.ts';
import { type AgentsUpdateInput, collectPatch } from './agent-update-collect.ts';
import { BUDGET_TUNING_TEXT, budgetJsonSchema } from './budget-json-schema.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

export const AGENT_ID_INPUT = {
  agentId: { type: 'string', description: 'Agent id or name from agents_list' },
};

type PatchTarget =
  | {
      row: AgentCatalogSummary;
    }
  | {
      error: string;
    };

function resolvePatchTarget(query: string, rows: AgentCatalogSummary[]): PatchTarget {
  const roster = rows.filter((row) => !row.plugin).map((row) => ({ id: row.id, name: row.name }));
  const hit = resolveAgentTarget(query, roster);
  if ('error' in hit) {
    return hit;
  }
  const row = rows.find((r) => r.id === hit.id);
  if (!row) {
    return { error: `unknown target "${query}"` };
  }
  return { row };
}

function notOwnedDelegate(name: string): { error: string } {
  return {
    error:
      `"${name}" is not your delegate; this host limits agents_update to delegates created by you ` +
      '(top-level agents are managed in the project UI).',
  };
}

async function applyUpdate(
  deps: CreateAgentsToolsParams,
  raw: unknown,
  ctx: {
    agentId?: string;
  },
): Promise<{ agentId: string } | { error: string }> {
  const patchFn = deps.agents.patch;
  if (!patchFn) {
    return { error: 'agents_update is not available in this host' };
  }
  const input = (raw ?? {}) as AgentsUpdateInput;
  if (typeof input.agentId !== 'string' || !input.agentId) {
    return { error: 'agentId must be a non-empty string' };
  }
  const scope = scopeFor(deps, ctx);
  const rows = await deps.agents.list(scope);
  const target = resolvePatchTarget(input.agentId, rows);
  if ('error' in target) {
    return target;
  }
  if (deps.ownDelegatesOnly === true && target.row.parentId !== scope.agentId) {
    return notOwnedDelegate(target.row.name);
  }
  const collected = collectPatch(input);
  if ('error' in collected) {
    return collected;
  }
  if (Object.keys(collected.patch).length === 0) {
    return { error: 'nothing to update' };
  }
  await patchFn.call(deps.agents, scope, target.row.id, collected.patch);
  return { agentId: target.row.id };
}

export function agentUpdateTool(deps: CreateAgentsToolsParams): ToolDefinition {
  return tool('agents_update', {
    group: 'agents',
    operations: ['agents'],
    sideEffect: 'write',
    description:
      (deps.ownDelegatesOnly === true
        ? 'Patch delegates created by you (this host limits agents_update to them; top-level agents are managed in the project UI): '
        : 'Patch any agent in the org (top-level and delegates; full parity with the project UI config): ') +
      'name/role/instructions, model {provider, model, effort?} (replaces the stored ref), ' +
      'runtime budget (replaces stored; omitted fields drop out), ' +
      'budgetUsdDaily, status active|archived, parentId (null promotes to top level), skills, mcpServers, ' +
      'sharedSourceIds, sourceLevels {sourceId: read|edit}, secretNames, enabledPlugins, executionProfileId, ' +
      'defaultModeId, hooks, config, permissions (replaces the stored op → allow|ask|deny map; always asks ' +
      'the user for approval; passing permissions inside config fails with an error). ' +
      'Unknown targets, plugin agents and ambiguous names fail with an error. ' +
      'agentId accepts an exact id, a unique id prefix (8+ chars), or a name. ' +
      'At least one field besides agentId is required. Returns { agentId }.',
    input: {
      type: 'object',
      properties: {
        ...AGENT_ID_INPUT,
        name: { type: 'string', description: 'New display name' },
        role: { type: 'string', description: 'New role label (not unique)' },
        instructions: {
          type: 'string',
          description: 'New system instructions',
        },
        model: {
          type: 'object',
          description:
            'Model ref {provider, model, effort?} (replaces the stored ref; generation is a create-only field)',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
            effort: { type: 'string' },
          },
          required: ['provider', 'model'],
          additionalProperties: false,
        },
        budget: budgetJsonSchema({
          policyEnum: ['ask', 'error'],
          description:
            'Run budget; replaces the stored budget (omitted fields drop out). At least one of maxSteps/maxTokens/deadlineMs/policy. ' +
            BUDGET_TUNING_TEXT,
        }),
        budgetUsdDaily: { type: 'number', nullable: true },
        status: { type: 'string', enum: ['active', 'archived'] },
        parentId: { type: 'string', nullable: true },
        executionProfileId: { type: 'string', nullable: true },
        defaultModeId: { type: 'string', nullable: true },
        sharedSourceIds: { type: 'array', items: { type: 'string' } },
        sourceLevels: {
          type: 'object',
          description: 'sourceId → read|edit',
          additionalProperties: { type: 'string', enum: ['read', 'edit'] },
        },
        secretNames: { type: 'array', items: { type: 'string' } },
        skills: { type: 'array', items: { type: 'string' } },
        mcpServers: { type: 'array', items: { type: 'string' } },
        enabledPlugins: {
          type: 'object',
          description: 'plugin name → enabled',
          additionalProperties: { type: 'boolean' },
        },
        hooks: { type: 'array' },
        config: { type: 'object' },
        permissions: {
          type: 'object',
          description:
            'Full replacement of the stored permission map (operation → allow|ask|deny); requires user approval; {} resets to defaults',
          additionalProperties: { type: 'string', enum: ['allow', 'ask', 'deny'] },
        },
      },
      required: ['agentId'],
    },
    gate: permissionsAskGate,
    execute: (raw, ctx) => runGuard(() => applyUpdate(deps, raw, ctx)),
  });
}
