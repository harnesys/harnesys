import {
  type Agent,
  type AgentDraft,
  toClientAgentFromPublic,
  useAgentStore,
} from '@/entities/agent';
import { createAgentInOrg, fetchOrgAgents } from '@/shared/api';
import { mergeAgentConfigFromDraft } from './agent-config-payload';

export interface CreateAgentResult {
  agent: Agent;
}

export async function createAgent(
  orgId: string,
  draft: AgentDraft,
): Promise<CreateAgentResult | null> {
  const name = draft.name.trim();
  if (!orgId || !name) {
    return null;
  }
  if (!draft.modelId) {
    return null;
  }
  const config = mergeAgentConfigFromDraft(undefined, draft);
  const record = await createAgentInOrg(orgId, {
    name,
    role: draft.role || 'Operator',
    instructions: draft.instructions,
    modelId: draft.modelId,
    parentId: draft.parentId ?? null,
    enabledPlugins: draft.enabledPlugins,
    defaultModeId: draft.defaultModeId ?? null,
    sharedSourceIds: draft.sharedSourceIds ?? [],
    sourceLevels: draft.sourceLevels ?? {},
    ...(Object.keys(config).length > 0 ? { config } : {}),
  });
  const agent = toClientAgentFromPublic(record);
  useAgentStore.getState().upsert(agent);
  return { agent };
}

export async function refreshOrgAgents(orgId: string): Promise<Agent[]> {
  const response = await fetchOrgAgents(orgId);
  const agents = response.items
    .filter((item) => item.status !== 'archived')
    .map(toClientAgentFromPublic);
  useAgentStore.getState().replaceOrg(orgId, agents);
  return agents;
}
