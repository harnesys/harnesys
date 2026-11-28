import { parseSpawnBudget } from '../../application/graph-spawn.ts';
import type { AgentBudget, BudgetPolicy } from '../../domain/agent-definition.ts';
import type { AgentCatalogModel, AgentCatalogPatch } from '../../ports/agents-catalog.ts';
import type { PermissionMap } from '../../ports/permissions.ts';
import { BUDGET_LIMIT_FIELDS, validateBudgetTuning } from './budget-json-schema.ts';

export interface AgentsUpdateInput {
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
  permissions?: unknown;
}

const PATCH_STRING_FIELDS = ['name', 'role', 'instructions'] as const;
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
  const tuning = rec === null ? { fields: {} as AgentBudget } : validateBudgetTuning(rec);
  if ('error' in tuning) {
    return tuning;
  }
  const policy = rec?.policy;
  if (policy !== undefined && !isBudgetPolicy(policy)) {
    return { error: 'budget.policy must be ask or error' };
  }
  const hasLimit = rec !== null && BUDGET_LIMIT_FIELDS.some((key) => rec[key] !== undefined);
  if (rec && policy !== undefined && !hasLimit) {
    return { budget: { policy, ...tuning.fields } };
  }
  const parsed = parseSpawnBudget(raw);
  if (parsed.error !== undefined) {
    return { error: parsed.error };
  }
  return {
    budget: { ...parsed.budget, ...tuning.fields, ...(policy !== undefined ? { policy } : {}) },
  };
}

function collectPermissions(
  input: AgentsUpdateInput,
  patch: AgentCatalogPatch,
): { error: string } | null {
  if (input.permissions === undefined) {
    return null;
  }
  if (
    typeof input.permissions !== 'object' ||
    input.permissions === null ||
    Array.isArray(input.permissions)
  ) {
    return { error: 'permissions must be an object mapping operation to allow|ask|deny' };
  }
  patch.permissions = input.permissions as PermissionMap;
  return null;
}

function collectModel(raw: unknown): { ref?: AgentCatalogModel } | { error: string } {
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
  const ref: AgentCatalogModel = { provider: rec.provider, model: rec.model };
  if (rec.effort !== undefined) {
    if (typeof rec.effort !== 'string' || !rec.effort) {
      return { error: 'model.effort must be a non-empty string' };
    }
    ref.effort = rec.effort;
  }
  return { ref };
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

export function collectPatch(
  input: AgentsUpdateInput,
): { patch: AgentCatalogPatch } | { error: string } {
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
  const permissions = collectPermissions(input, patch);
  if (permissions !== null) {
    return permissions;
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
