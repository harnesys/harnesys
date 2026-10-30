import type {
  AgentHook,
  AgentPresetDetail,
  AgentPublic,
  CreateAgentBody,
  CreateAgentFromPresetBody,
  HookRunListResponse,
  HookTestResponse,
  ListAgentsResponse,
  UpdateAgentBody,
} from '@harnesys/contracts';
import type {
  AgentBudget,
  AgentGenerationSettings,
  AgentGraph,
  AgentMode,
  AgentRecord,
  PackAssignment,
  PortRef,
  ToolOutputSettings,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import type { PermissionMap } from 'harnesys';
import { apiJson } from './client';

export type { AgentPublic, CreateAgentBody, CreateAgentFromPresetBody, UpdateAgentBody };

function agentsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/agents`;
}

export function fetchOrgAgents(orgId: string) {
  return apiJson<ListAgentsResponse>(agentsBase(orgId));
}

export function getOrgAgent(orgId: string, agentId: string) {
  return apiJson<AgentPublic>(`${agentsBase(orgId)}/${encodeURIComponent(agentId)}`);
}

export function createAgentInOrg(orgId: string, body: CreateAgentBody) {
  return apiJson<AgentPublic>(agentsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAgentInOrg(orgId: string, agentId: string, body: UpdateAgentBody) {
  return apiJson<AgentPublic>(`${agentsBase(orgId)}/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAgentInOrg(orgId: string, agentId: string) {
  return apiJson<void>(`${agentsBase(orgId)}/${encodeURIComponent(agentId)}`, {
    method: 'DELETE',
  });
}

export function createAgentFromPresetInOrg(orgId: string, body: CreateAgentFromPresetBody) {
  return apiJson<AgentPublic>(`${agentsBase(orgId)}/from-preset`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function listAgentHookRuns(orgId: string, agentId: string, limit = 20) {
  const base = `${agentsBase(orgId)}/${encodeURIComponent(agentId)}/hook-runs`;
  return apiJson<HookRunListResponse>(`${base}?limit=${limit}`);
}

export function testAgentHook(orgId: string, agentId: string, hook: AgentHook) {
  const base = `${agentsBase(orgId)}/${encodeURIComponent(agentId)}/hooks/test`;
  return apiJson<HookTestResponse>(base, {
    method: 'POST',
    body: JSON.stringify({ hook }),
  });
}

export const orgScopedAgentsQueryKey = ['org-scoped-agents'] as const;

export function orgScopedAgentsQueryKeyFor(orgId: string) {
  return [...orgScopedAgentsQueryKey, orgId] as const;
}

export function orgScopedAgentsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgScopedAgentsQueryKeyFor(orgId),
    queryFn: () => fetchOrgAgents(orgId),
    enabled: Boolean(orgId),
  });
}

export interface CreateAgentInput {
  name: string;
  parentId?: string | null;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  graph?: AgentGraph;
  capabilities?: Record<string, PackAssignment | null>;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
}
export interface UpdateAgentInput {
  name?: string;
  modelId?: string | null;
  role?: string;
  instructions?: string;
  effort?: string | null;
  generation?: AgentGenerationSettings | null;
  toolOutput?: ToolOutputSettings | null;
  budget?: AgentBudget | null;
  compaction?: PortRef;
  skills?: string[];
  mcpServers?: string[];
  graph?: AgentGraph;
  capabilities?: Record<string, PackAssignment | null>;
  permissions?: PermissionMap | null;
  color?: string | null;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
  defaultModeId?: string | null;
  modes?: AgentMode[];
}
export type AgentPresetCapabilities = Record<string, PackAssignment | null>;
export type AgentPresetPermissions = PermissionMap | null;

export interface AgentPresetRecord {
  id: string;
  name: string;
  role: string;
  instructions: string;
  color?: string | null;
  skills?: string[];
  mcpServers?: string[];
  budget?: AgentBudget | null;
  capabilities?: AgentPresetCapabilities;
  permissions?: AgentPresetPermissions;
  graph?: AgentGraph;
}

export function listAgents(_projectId: string): Promise<AgentRecord[]> {
  return Promise.resolve([]);
}
export function toLegacyPresetRecord(detail: AgentPresetDetail): AgentPresetRecord {
  const body = detail.body;
  return {
    id: detail.id,
    name: body.name,
    role: body.role,
    instructions: body.instructions,
    color: body.color ?? null,
    skills: body.skills,
    mcpServers: body.mcpServers,
    budget: body.budget ?? null,
    capabilities: (body.capabilities ?? {}) as AgentPresetCapabilities,
    permissions: (body.permissions ?? null) as AgentPresetPermissions,
    graph: body.graph as AgentGraph | undefined,
  };
}
export function createAgentRecord(projectId: string, body: CreateAgentInput) {
  return apiJson<AgentRecord>(`/api/projects/${projectId}/agents`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function createAgentFromPresetRecord(
  projectId: string,
  presetId: string,
  options?: {
    parentId?: string | null;
  },
) {
  return apiJson<AgentRecord>(`/api/projects/${projectId}/agents/from-preset`, {
    method: 'POST',
    body: JSON.stringify({
      presetId,
      ...(options?.parentId ? { parentId: options.parentId } : {}),
    }),
  });
}
export function updateAgentRecord(projectId: string, agentId: string, body: UpdateAgentInput) {
  return apiJson<AgentRecord>(`/api/projects/${projectId}/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function deleteAgentRecord(projectId: string, agentId: string) {
  return apiJson<void>(`/api/projects/${projectId}/agents/${agentId}`, {
    method: 'DELETE',
  });
}
