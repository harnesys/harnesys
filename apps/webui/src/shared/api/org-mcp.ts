import type {
  ListOrgMcpConfigResponse,
  ListOrgMcpResponse,
  SetOrgMcpServerStateBody,
  UpsertOrgMcpServerBody,
  UpsertOrgMcpServerResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type {
  ListOrgMcpConfigResponse,
  ListOrgMcpResponse,
  SetOrgMcpServerStateBody,
  UpsertOrgMcpServerBody,
  UpsertOrgMcpServerResponse,
};

function mcpBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/mcp`;
}

export function orgMcpConfigQueryKey(orgId: string) {
  return ['orgs', orgId, 'mcp', 'config'] as const;
}

export function listOrgMcp(orgId: string) {
  return apiJson<ListOrgMcpResponse>(mcpBase(orgId));
}

export function listOrgMcpConfig(orgId: string) {
  return apiJson<ListOrgMcpConfigResponse>(`${mcpBase(orgId)}/config`);
}

export function orgMcpConfigQuery(orgId: string) {
  return queryOptions({
    queryKey: orgMcpConfigQueryKey(orgId),
    queryFn: () => listOrgMcpConfig(orgId),
    enabled: Boolean(orgId),
  });
}

export function reloadOrgMcp(orgId: string) {
  return apiJson<ListOrgMcpConfigResponse>(`${mcpBase(orgId)}/reload`, {
    method: 'POST',
  });
}

export function upsertOrgMcpServer(orgId: string, serverId: string, body: UpsertOrgMcpServerBody) {
  return apiJson<UpsertOrgMcpServerResponse>(
    `${mcpBase(orgId)}/servers/${encodeURIComponent(serverId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function deleteOrgMcpServer(orgId: string, serverId: string) {
  return apiJson<void>(`${mcpBase(orgId)}/servers/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  });
}

export function setOrgMcpServerState(
  orgId: string,
  serverId: string,
  body: SetOrgMcpServerStateBody,
) {
  return apiJson<ListOrgMcpConfigResponse>(
    `${mcpBase(orgId)}/servers/${encodeURIComponent(serverId)}/state`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}

export function restartOrgMcpServer(orgId: string, serverId: string) {
  return apiJson<ListOrgMcpConfigResponse>(
    `${mcpBase(orgId)}/servers/${encodeURIComponent(serverId)}/restart`,
    {
      method: 'POST',
    },
  );
}
