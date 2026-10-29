import { resolveAgentTarget } from '../../application/agent-target-resolve.ts';
import { parseSpawnBudget } from '../../application/graph-spawn.ts';
import type { AgentBudget, AgentModelRef, BudgetPolicy } from '../../domain/agent-definition.ts';
import type { AgentCatalogPatch, AgentCatalogSummary } from '../../ports/agents-catalog.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';
import type { CreateAgentsToolsParams } from './create-agents-tools.ts';
import { runGuard } from './run-guard.ts';
import { scopeFor } from './scope-for.ts';

export const AGENT_ID_INPUT = {
  agentId: { type: 'string', description: 'Delegate id or name from agents_list' },
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

interface AgentsUpdateInput {
  agentId?: unknown;
  name?: unknown;
  role?: unknown;
  instructions?: unknown;
  budget?: unknown;
  model?: unknown;
  budgetUsdDaily?: unknown;
  status?: unknown;
  parentId?: unknown;
  executionProfileId?: unknown;
  defaultModeId?: unknown;
  sharedSourceIds?: unknown;
  sourceLevels?: unknown;
  secretNames?: unknown;
  skills?: unknown;
  mcpServers?: unknown;
  enabledPlugins?: unknown;
  hooks?: unknown;
  config?: unknown;
}

const PATCH_STRING_FIELDS = ['name', 'role', 'instructions'] as const;
const BUDGET_LIMIT_FIELDS = ['maxSteps', 'maxTokens', 'deadlineMs'] as const;
const PATCH_PASSTHROUGH_FIELDS = [
  'sharedSourceIds',
  'sourceLevels',
  'secretNames',
  'skills',
  'mcpServers',
  'enabledPlugins',
  'hooks',
  'config',
] as const;
const PATCH_NULLABLE_STRING_FIELDS = [
  'status',
  'parentId',
  'executionProfileId',
  'defaultModeId',
] as const;

function isBudgetPolicy(value: unknown): value is BudgetPolicy {
  return value === 'ask' || value === 'error';
}

function collectBudget(raw: unknown): { budget: AgentBudget } | { error: string } {
  const rec =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const policy = rec?.policy;
  if (policy !== undefined && !isBudgetPolicy(policy)) {
    return { error: 'budget.policy must be ask or error' };
  }
  const hasLimit = rec !== null && BUDGET_LIMIT_FIELDS.some((key) => rec[key] !== undefined);
  if (rec && policy !== undefined && !hasLimit) {
    return { budget: { policy } };
  }
  const parsed = parseSpawnBudget(raw);
  if (parsed.error !== undefined) {
    return { error: parsed.error };
  }
  return { budget: { ...parsed.budget, ...(policy !== undefined ? { policy } : {}) } };
}

function collectModel(raw: unknown): { ref?: AgentModelRef } | { error: string } {
  if (raw === undefined) {
    return {};
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'model must be an object { provider, model }' };
  }
  const rec = raw as Record<string, unknown>;
  if (typeof rec.provider !== 'string' || typeof rec.model !== 'string') {
    return { error: 'model must be an object { provider, model }' };
  }
  return { ref: { provider: rec.provider, model: rec.model } };
}

function collectPassthrough(
  input: AgentsUpdateInput,
  fields: Partial<AgentCatalogPatch>,
): { error: string } | null {
  for (const key of PATCH_PASSTHROUGH_FIELDS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (value === null || typeof value !== 'object') {
      return { error: `${key} must be an object or array` };
    }
    fields[key] = value as never;
  }
  return null;
}

function collectNullableStrings(
  input: AgentsUpdateInput,
  fields: Partial<AgentCatalogPatch>,
): { error: string } | null {
  for (const key of PATCH_NULLABLE_STRING_FIELDS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (value !== null && typeof value !== 'string') {
      return { error: `${key} must be a string or null` };
    }
    fields[key] = value as never;
  }
  return null;
}

function collectStringFields(
  input: AgentsUpdateInput,
  patch: AgentCatalogPatch,
): { error: string } | null {
  for (const key of PATCH_STRING_FIELDS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string' || !value) {
      return { error: `${key} must be a non-empty string` };
    }
    patch[key] = value;
  }
  return null;
}

function collectBudgetField(
  input: AgentsUpdateInput,
  patch: AgentCatalogPatch,
): { error: string } | null {
  if (input.budget === undefined || input.budget === null) {
    return null;
  }
  const collected = collectBudget(input.budget);
  if ('error' in collected) {
    return collected;
  }
  patch.budget = collected.budget;
  return null;
}

function collectPatch(input: AgentsUpdateInput): { patch: AgentCatalogPatch } | { error: string } {
  const patch: AgentCatalogPatch = {};
  const strings = collectStringFields(input, patch);
  if (strings !== null) {
    return strings;
  }
  const budget = collectBudgetField(input, patch);
  if (budget !== null) {
    return budget;
  }
  const model = collectModel(input.model);
  if ('error' in model) {
    return model;
  }
  if (model.ref !== undefined) {
    patch.model = model.ref;
  }
  const fields: Partial<AgentCatalogPatch> = {};
  const passthrough = collectPassthrough(input, fields) ?? collectNullableStrings(input, fields);
  if (passthrough !== null) {
    return passthrough;
  }
  const usd = input.budgetUsdDaily;
  if (usd !== undefined) {
    if (usd !== null && typeof usd !== 'number') {
      return { error: 'budgetUsdDaily must be a number or null' };
    }
    fields.budgetUsdDaily = usd;
  }
  Object.assign(patch, fields);
  return { patch };
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
      'Patch any agent in the org (top-level and delegates; full parity with the project UI config): ' +
      'name/role/instructions, model {provider, model}, runtime budget (replaces stored; omitted fields drop out), ' +
      'budgetUsdDaily, status active|archived, parentId (null promotes to top level), skills, mcpServers, ' +
      'sharedSourceIds, sourceLevels {sourceId: read|edit}, secretNames, enabledPlugins, executionProfileId, ' +
      'defaultModeId, hooks, config. Unknown targets, plugin agents and ambiguous names fail with an error. ' +
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
          description: 'Model ref, same shape as agents_create',
          properties: {
            provider: { type: 'string' },
            model: { type: 'string' },
          },
          required: ['provider', 'model'],
          additionalProperties: false,
        },
        budget: {
          type: 'object',
          description:
            'Run budget; replaces the stored budget (omitted fields drop out). At least one of maxSteps/maxTokens/deadlineMs/policy. Same shape as agents_create.',
          properties: {
            maxSteps: { type: 'integer', minimum: 1 },
            maxTokens: { type: 'integer', minimum: 1 },
            deadlineMs: { type: 'integer', minimum: 1 },
            policy: {
              type: 'string',
              enum: ['ask', 'error'],
              description: 'Budget stop behavior; mirrors agents_create',
            },
          },
          additionalProperties: false,
        },
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
      },
      required: ['agentId'],
    },
    execute: (raw, ctx) => runGuard(() => applyUpdate(deps, raw, ctx)),
  });
}
