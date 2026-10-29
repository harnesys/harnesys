import { defaultAgentCompaction } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { randomUUID } from '@/shared/lib/random-uuid';
import { type Agent, type AgentDraft, type AgentPatch, initialsFromName } from './agent';

interface AgentStore {
  items: Agent[];
  byId: (id: string) => Agent | undefined;
  inOrg: (orgId: string) => Agent[];
  create: (orgId: string, draft: AgentDraft) => Agent | null;
  upsert: (agent: Agent) => void;
  replaceOrg: (orgId: string, agents: Agent[]) => void;
  update: (agentId: string, patch: AgentPatch) => void;
  remove: (agentId: string) => void;
}
function patchedAgent(agent: Agent, patch: AgentPatch, name?: string): Agent {
  return {
    ...agent,
    name: name ?? agent.name,
    role: patch.role !== undefined ? patch.role.trim() || agent.role : agent.role,
    instructions: patch.instructions !== undefined ? patch.instructions.trim() : agent.instructions,
    modelId: patch.modelId !== undefined ? patch.modelId : agent.modelId,
    budget: patch.budget !== undefined ? patch.budget : agent.budget,
    budgetUsdDaily:
      patch.budgetUsdDaily !== undefined ? patch.budgetUsdDaily : agent.budgetUsdDaily,
    compaction: patch.compaction !== undefined ? patch.compaction : agent.compaction,
    skills: patch.skills !== undefined ? patch.skills : agent.skills,
    mcpServers: patch.mcpServers !== undefined ? patch.mcpServers : agent.mcpServers,
    graph: patch.graph !== undefined ? patch.graph : agent.graph,
    capabilities: patch.capabilities !== undefined ? patch.capabilities : agent.capabilities,
    hooks: patch.hooks !== undefined ? patch.hooks : agent.hooks,
    enabledPlugins:
      patch.enabledPlugins !== undefined ? patch.enabledPlugins : agent.enabledPlugins,
    defaultModeId: patch.defaultModeId !== undefined ? patch.defaultModeId : agent.defaultModeId,
    modes: patch.modes !== undefined ? patch.modes : agent.modes,
    initials: name ? initialsFromName(name) : agent.initials,
  };
}
function removeAgent(items: Agent[], agentId: string): Agent[] {
  return items.filter((agent) => agent.id !== agentId);
}
function draftToAgent(orgId: string, draft: AgentDraft, name: string): Agent {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    orgId,
    parentId: draft.parentId ?? null,
    name,
    modelId: draft.modelId,
    role: draft.role.trim() || 'Operator',
    instructions: draft.instructions.trim(),
    effort: draft.effort ?? null,
    generation: draft.generation ?? null,
    toolOutput: draft.toolOutput ?? null,
    budget: draft.budget ?? null,
    budgetUsdDaily: draft.budgetUsdDaily ?? null,
    memoryPolicy: draft.memoryPolicy ?? null,
    compaction: draft.compaction === undefined ? defaultAgentCompaction() : draft.compaction,
    skills: [],
    mcpServers: [],
    graph: draft.graph ?? { nodes: {}, edges: [] },
    capabilities: draft.capabilities ?? {},
    permissions: draft.permissions ?? null,
    sharedSourceIds: draft.sharedSourceIds ?? [],
    sourceLevels: draft.sourceLevels ?? {},
    color: draft.color ?? null,
    hooks: draft.hooks ?? [],
    enabledPlugins: draft.enabledPlugins ?? {},
    defaultModeId: draft.defaultModeId ?? null,
    executionProfileId: draft.executionProfileId ?? null,
    modes: draft.modes ?? [],
    createdAt: now,
    updatedAt: now,
    status: 'idle',
    initials: initialsFromName(name),
    lastActiveAt: now,
    currentTask: draft.modelId ? 'Ready.' : 'Pick a model to chat.',
  };
}
function upsertAgent(items: Agent[], agent: Agent): Agent[] {
  return items.some((item) => item.id === agent.id)
    ? items.map((item) => (item.id === agent.id ? agent : item))
    : [...items, agent];
}
export const useAgentStore = create<AgentStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  inOrg: (orgId) => get().items.filter((item) => item.orgId === orgId),
  create: (orgId, draft) => {
    const name = draft.name.trim();
    if (!orgId || !name) {
      return null;
    }
    const agent = draftToAgent(orgId, draft, name);
    set((state) => ({ items: [...state.items, agent] }));
    return agent;
  },
  upsert: (agent) => {
    set((state) => ({ items: upsertAgent(state.items, agent) }));
  },
  replaceOrg: (orgId, agents) => {
    set((state) => ({
      items: [...state.items.filter((item) => item.orgId !== orgId), ...agents],
    }));
  },
  update: (agentId, patch) => {
    const current = get().items.find((agent) => agent.id === agentId);
    if (!current) {
      return;
    }
    if (patch.name !== undefined && !patch.name.trim()) {
      return;
    }
    const name = patch.name?.trim();
    set((state) => ({
      items: state.items.map((agent) =>
        agent.id === agentId ? patchedAgent(agent, patch, name) : agent,
      ),
    }));
  },
  remove: (agentId) => {
    set((state) => ({ items: removeAgent(state.items, agentId) }));
  },
}));
