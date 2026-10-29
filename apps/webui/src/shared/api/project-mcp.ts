import type { McpConfigServer } from '@harnesys/contracts';
import type {
  ComponentStatus,
  GrantClass,
  ProjectMcpConfigServer,
  ProjectMcpServer,
  UpsertProjectMcpServerRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import type { McpResourceInfo } from 'harnesys';
import { ApiError } from './client';
import {
  deleteOrgMcpServer,
  listOrgMcp,
  listOrgMcpConfig,
  reloadOrgMcp,
  restartOrgMcpServer,
  setOrgMcpServerState,
  upsertOrgMcpServer,
} from './org-mcp';
import { projectQueryKey, resolveOrgId } from './project-base';

export interface ProjectMcpResponse {
  servers: ProjectMcpServer[];
}
export interface ProjectMcpConfigResponse {
  servers: ProjectMcpConfigServer[];
}
export interface UpsertProjectMcpServerResponse {
  server: ProjectMcpConfigServer;
}
export function projectMcpQueryKey(projectId: string) {
  return [...projectQueryKey, projectId, 'mcp'] as const;
}

function requireOrgId(projectId: string): string {
  const orgId = resolveOrgId(projectId);
  if (!orgId) {
    throw new ApiError(400, 'no active org');
  }
  return orgId;
}

export async function listProjectMcp(projectId: string): Promise<ProjectMcpResponse> {
  const orgId = resolveOrgId(projectId);
  if (!orgId) {
    return { servers: [] };
  }
  const result = await listOrgMcp(orgId);
  return {
    servers: result.servers.map((server) => ({
      serverId: server.serverId,
      transport: server.transport,
      connected: server.connected,
      toolCount: server.toolCount,
      tools: server.tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' })),
      resources: server.resources as McpResourceInfo[],
    })),
  };
}
export function projectMcpQuery(projectId: string) {
  return queryOptions({
    queryKey: projectMcpQueryKey(projectId),
    queryFn: () => listProjectMcp(projectId),
    staleTime: 20000,
  });
}
export function projectMcpConfigQueryKey(projectId: string) {
  return [...projectQueryKey, projectId, 'mcp', 'config'] as const;
}

function toProjectMcpConfigServer(server: McpConfigServer): ProjectMcpConfigServer {
  return {
    serverId: server.serverId,
    enabled: server.enabled,
    transport: server.transport,
    ...(server.command !== undefined ? { command: server.command } : {}),
    ...(server.args !== undefined ? { args: server.args } : {}),
    ...(server.env !== undefined ? { env: server.env } : {}),
    ...(server.url !== undefined ? { url: server.url } : {}),
    ...(server.headers !== undefined ? { headers: server.headers } : {}),
    connected: server.connected,
    toolCount: server.toolCount,
    origin:
      server.origin.kind === 'plugin'
        ? {
            kind: 'plugin',
            pluginName: server.origin.pluginName,
            status: (server.origin.status ?? 'native') as ComponentStatus,
            ...(server.origin.inertReason !== undefined
              ? { inertReason: server.origin.inertReason }
              : {}),
          }
        : { kind: 'project' },
    ...(server.disabledByUser !== undefined ? { disabledByUser: server.disabledByUser } : {}),
    ...(server.requiredGrant !== undefined
      ? { requiredGrant: server.requiredGrant as GrantClass }
      : {}),
  };
}

export async function listProjectMcpConfig(projectId: string): Promise<ProjectMcpConfigResponse> {
  const result = await listOrgMcpConfig(requireOrgId(projectId));
  return { servers: result.servers.map(toProjectMcpConfigServer) };
}
export function projectMcpConfigQuery(projectId: string) {
  return queryOptions({
    queryKey: projectMcpConfigQueryKey(projectId),
    queryFn: () => listProjectMcpConfig(projectId),
    staleTime: 20000,
  });
}
export async function reloadProjectMcp(projectId: string): Promise<ProjectMcpConfigResponse> {
  const result = await reloadOrgMcp(requireOrgId(projectId));
  return { servers: result.servers.map(toProjectMcpConfigServer) };
}
export async function upsertProjectMcpServer(
  projectId: string,
  serverId: string,
  body: UpsertProjectMcpServerRequest,
): Promise<UpsertProjectMcpServerResponse> {
  const result = await upsertOrgMcpServer(requireOrgId(projectId), serverId, body);
  return { server: toProjectMcpConfigServer(result.server) };
}
export function deleteProjectMcpServer(projectId: string, serverId: string): Promise<void> {
  return deleteOrgMcpServer(requireOrgId(projectId), serverId);
}
export async function setProjectMcpServerState(
  projectId: string,
  serverId: string,
  body: {
    enabled: boolean;
  },
): Promise<ProjectMcpConfigResponse> {
  const result = await setOrgMcpServerState(requireOrgId(projectId), serverId, body);
  return { servers: result.servers.map(toProjectMcpConfigServer) };
}
export async function restartProjectMcpServer(
  projectId: string,
  serverId: string,
): Promise<ProjectMcpConfigResponse> {
  const result = await restartOrgMcpServer(requireOrgId(projectId), serverId);
  return { servers: result.servers.map(toProjectMcpConfigServer) };
}
