import type { QueryClient } from '@tanstack/react-query';
import type { Agent } from '@/entities/agent';
import { getActiveOrgId } from '@/shared/api/active-org';
import { orgAgentCapabilitiesQueryKey } from '@/shared/api/org-capabilities';
import { toast } from '@/shared/ui/toast';
import type { AgentCapabilitiesDraft, AgentConfigResult } from '../model/agent-config';
import { agentFieldsFrom, agentFieldsSchema, toAgentDraft } from '../model/agent-fields';
import { mcpServerPluginOf, skillPluginOf } from '../model/capability-allowlist';
import { updateAgent, updateAgentCapabilities } from '../model/update-agent';

export function deletedConfigResult(agent: Agent): AgentConfigResult {
  return {
    fields: toAgentDraft(agentFieldsSchema.parse(agentFieldsFrom(agent))),
    capabilities: {},
    deleted: true,
  };
}

export function initialCapabilities(agent: Agent | null): AgentCapabilitiesDraft {
  const draft: AgentCapabilitiesDraft = {
    skills: agent?.skills ?? [],
    mcpServers: agent?.mcpServers ?? [],
    compaction: agent?.compaction,
    capabilities: agent?.capabilities ?? {},
    hooks: agent?.hooks ?? [],
    enabledPlugins: agent?.enabledPlugins ?? {},
  };
  const owners = new Set<string>();
  for (const name of draft.skills ?? []) {
    const plugin = skillPluginOf(name);
    if (plugin) {
      owners.add(plugin);
    }
  }
  for (const name of draft.mcpServers ?? []) {
    const plugin = mcpServerPluginOf(name);
    if (plugin) {
      owners.add(plugin);
    }
  }
  const off = [...owners].filter((plugin) => draft.enabledPlugins?.[plugin] !== true);
  return off.length > 0 ? stripPlugins(off, draft) : draft;
}

function stripPlugins(plugins: string[], draft: AgentCapabilitiesDraft): AgentCapabilitiesDraft {
  const offSkill = (name: string) => plugins.some((p) => name.startsWith(`${p}:`));
  const offMcp = (name: string) => plugins.some((p) => name.startsWith(`plugin:${p}:`));
  return {
    ...draft,
    skills: (draft.skills ?? []).filter((name) => !offSkill(name)),
    mcpServers: (draft.mcpServers ?? []).filter((name) => !offMcp(name)),
  };
}

export async function persistAgentConfigEdit(input: {
  orgId: string;
  agentId: string;
  result: AgentConfigResult;
  queryClient: QueryClient;
  successTitle?: string;
}): Promise<boolean> {
  try {
    await updateAgent(input.orgId, input.agentId, input.result.fields);
    await updateAgentCapabilities(input.orgId, input.agentId, input.result.capabilities);
    await input.queryClient.invalidateQueries({
      queryKey: orgAgentCapabilitiesQueryKey(getActiveOrgId() ?? input.orgId, input.agentId),
    });
    if (input.successTitle) {
      toast.add({ title: input.successTitle });
    }
    return true;
  } catch (error) {
    toast.add({
      title: error instanceof Error ? error.message : 'Could not save agent',
    });
    return false;
  }
}

export function mergeCapabilitiesDraft(
  prev: AgentCapabilitiesDraft,
  patch: Partial<AgentCapabilitiesDraft>,
): AgentCapabilitiesDraft {
  const merged = { ...prev, ...patch };
  if (patch.enabledPlugins === undefined) {
    return merged;
  }
  const off = Object.entries(prev.enabledPlugins ?? {})
    .filter(([name, on]) => on && patch.enabledPlugins?.[name] !== true)
    .map(([name]) => name);
  return off.length > 0 ? stripPlugins(off, merged) : merged;
}

export function resolveFocusAgent(input: {
  storeFocus: Agent | null;
  rootAgent: Agent | null;
  focusMatches: boolean;
  isPresetDraft: boolean;
}): Agent | null {
  if (input.storeFocus) {
    return input.storeFocus;
  }
  if (input.focusMatches || input.isPresetDraft) {
    return input.rootAgent;
  }
  return null;
}

export function resolveReturnParent(input: {
  storeReturnParent: Agent | null;
  rootAgent: Agent | null;
  returnParentId: string | null;
}): Agent | null {
  if (input.storeReturnParent) {
    return input.storeReturnParent;
  }
  if (input.returnParentId && input.returnParentId === input.rootAgent?.id) {
    return input.rootAgent;
  }
  return null;
}
