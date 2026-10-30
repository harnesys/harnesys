import { defaultAgentCompaction } from '@harnesys/studio-shared';
import {
  type Agent,
  initialsFromName,
  toClientAgentFromPublic,
  useAgentStore,
} from '@/entities/agent';
import { createAgentFromPresetInOrg } from '@/shared/api';
import type { AgentPresetRecord } from '@/shared/api/agents';
import { refreshOrgAgents } from './create-agent';
export interface CreateAgentFromPresetResult {
  agent: Agent;
}
export function agentDraftFromPreset(preset: AgentPresetRecord): Agent {
  return {
    id: '',
    name: preset.name,
    orgId: '',
    parentId: null,
    modelId: null,
    role: preset.role,
    instructions: preset.instructions,
    color: preset.color ?? null,
    effort: null,
    generation: null,
    toolOutput: null,
    budget: preset.budget ?? null,
    budgetUsdDaily: null,
    memoryPolicy: null,
    compaction: defaultAgentCompaction(),
    skills: preset.skills ?? [],
    mcpServers: preset.mcpServers ?? [],
    graph: preset.graph ?? { nodes: {}, edges: [] },
    capabilities: preset.capabilities ?? {},
    permissions: preset.permissions ?? null,
    sharedSourceIds: [],
    sourceLevels: {},
    hooks: [],
    enabledPlugins: {},
    defaultModeId: null,
    executionProfileId: null,
    modes: [],
    createdAt: '',
    updatedAt: '',
    status: 'idle',
    initials: initialsFromName(preset.name),
    lastActiveAt: '',
    currentTask: '',
  };
}
export async function createAgentFromPreset(
  orgId: string,
  presetId: string,
  options?: {
    parentId?: string | null;
    name?: string;
    modelId?: string;
  },
): Promise<CreateAgentFromPresetResult | null> {
  if (!orgId || !presetId) {
    return null;
  }
  const record = await createAgentFromPresetInOrg(orgId, {
    presetId,
    ...(options?.parentId !== undefined ? { parentId: options.parentId } : {}),
    ...(options?.name?.trim() ? { name: options.name.trim() } : {}),
    ...(options?.modelId?.trim() ? { modelId: options.modelId.trim() } : {}),
  });
  const agent = toClientAgentFromPublic(record);
  useAgentStore.getState().upsert(agent);
  await refreshOrgAgents(orgId);
  return { agent };
}
