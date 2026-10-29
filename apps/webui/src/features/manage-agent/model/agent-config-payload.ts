import type { AgentDraft } from '@/entities/agent';

export function mergeAgentConfigFromDraft(
  existing: Record<string, unknown> | undefined,
  draft: AgentDraft,
): Record<string, unknown> {
  const config: Record<string, unknown> = { ...(existing ?? {}) };
  if (draft.effort !== undefined) {
    config.effort = draft.effort ?? undefined;
  }
  if (draft.generation !== undefined) {
    config.generation = draft.generation;
  }
  if (draft.toolOutput !== undefined) {
    config.toolOutput = draft.toolOutput;
  }
  if (draft.budget !== undefined) {
    config.budgetJson = draft.budget;
  }
  if (draft.memoryPolicy !== undefined) {
    config.memoryPolicyJson = draft.memoryPolicy;
  }
  if (draft.compaction !== undefined) {
    config.compactionJson = draft.compaction;
  }
  if (draft.graph !== undefined) {
    config.graphJson = draft.graph;
  }
  if (draft.capabilities !== undefined) {
    config.capabilitiesJson = draft.capabilities;
  }
  if (draft.permissions !== undefined) {
    config.permissionsJson = draft.permissions ?? undefined;
  }
  if (draft.color !== undefined) {
    config.color = draft.color ?? undefined;
  }
  if (draft.modes !== undefined) {
    config.modesJson = draft.modes;
  }
  return stripUndefined(config);
}

function stripUndefined(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
