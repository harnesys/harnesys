import {
  type AgentCapabilitiesPatch,
  type AgentDraft,
  toClientAgentFromPublic,
  useAgentStore,
} from '@/entities/agent';
import { useThreadStore } from '@/entities/thread';
import { getOrgAgent, listProviders, updateAgentInOrg } from '@/shared/api';
import { mergeAgentConfigFromDraft } from './agent-config-payload';
import { sanitizeForModel } from './agent-model-info';
import { refreshOrgAgents } from './create-agent';

export async function updateAgent(orgId: string, agentId: string, draft: AgentDraft) {
  const current = useAgentStore.getState().byId(agentId);
  if (!current) {
    return;
  }
  let effort = draft.effort !== undefined ? draft.effort : current.effort;
  let generation = draft.generation !== undefined ? draft.generation : current.generation;
  const toolOutput = draft.toolOutput !== undefined ? draft.toolOutput : current.toolOutput;
  const budget = draft.budget !== undefined ? draft.budget : current.budget;
  if (draft.modelId !== current.modelId) {
    const providers = await listProviders(orgId);
    const sanitized = sanitizeForModel(draft.modelId, effort, generation, providers);
    effort = sanitized.effort;
    generation = sanitized.generation;
  }
  const existing = await getOrgAgent(orgId, agentId);
  const config = mergeAgentConfigFromDraft(existing.config, {
    ...draft,
    effort,
    generation,
    toolOutput,
    budget,
    modes: draft.modes ?? [],
    color: draft.color !== undefined ? draft.color : current.color,
    permissions: draft.permissions !== undefined ? draft.permissions : current.permissions,
  });
  const record = await updateAgentInOrg(orgId, agentId, {
    name: draft.name.trim() || current.name,
    role: draft.role,
    instructions: draft.instructions,
    modelId: draft.modelId ?? current.modelId ?? undefined,
    defaultModeId: draft.defaultModeId ?? null,
    executionProfileId: draft.executionProfileId ?? null,
    enabledPlugins: draft.enabledPlugins,
    ...(draft.budgetUsdDaily !== undefined ? { budgetUsdDaily: draft.budgetUsdDaily } : {}),
    ...(draft.sharedSourceIds !== undefined ? { sharedSourceIds: draft.sharedSourceIds } : {}),
    ...(draft.sourceLevels !== undefined ? { sourceLevels: draft.sourceLevels } : {}),
    ...(draft.hooks !== undefined ? { hooks: draft.hooks } : {}),
    config,
  });
  const next = toClientAgentFromPublic(record);
  useAgentStore.getState().upsert(next);
  if (draft.modelId !== current.modelId && !current.parentId) {
    await refreshOrgAgents(orgId);
  }
  if (next.name === current.name) {
    return;
  }
  useThreadStore.setState((state) => ({
    items: state.items.map((item) => (item.agentId === agentId ? { ...item } : item)),
  }));
}

export async function updateAgentCapabilities(
  orgId: string,
  agentId: string,
  patch: AgentCapabilitiesPatch,
) {
  const current = useAgentStore.getState().byId(agentId);
  if (!current) {
    return;
  }
  const existing = await getOrgAgent(orgId, agentId);
  const config = { ...(existing.config ?? {}) };
  if (patch.capabilities !== undefined) {
    config.capabilitiesJson = patch.capabilities;
  }
  if (patch.compaction !== undefined) {
    config.compactionJson = patch.compaction;
  }
  const record = await updateAgentInOrg(orgId, agentId, {
    skills: patch.skills,
    mcpServers: patch.mcpServers,
    enabledPlugins: patch.enabledPlugins,
    ...(patch.hooks !== undefined ? { hooks: patch.hooks } : {}),
    config,
  });
  useAgentStore.getState().upsert(toClientAgentFromPublic(record));
}
