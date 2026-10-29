import type {
  AgentCapabilitiesView,
  ListOrgCapabilitiesResponse,
  ListOrgToolsResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type { AgentCapabilitiesView, ListOrgCapabilitiesResponse, ListOrgToolsResponse };

function orgBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}`;
}

export function orgCapabilitiesQueryKey(orgId: string) {
  return ['orgs', orgId, 'capabilities'] as const;
}

export function listOrgCapabilities(orgId: string) {
  return apiJson<ListOrgCapabilitiesResponse>(`${orgBase(orgId)}/capabilities`);
}

export function orgCapabilitiesQuery(orgId: string) {
  return queryOptions({
    queryKey: orgCapabilitiesQueryKey(orgId),
    queryFn: () => listOrgCapabilities(orgId),
    enabled: Boolean(orgId),
    staleTime: 20000,
  });
}

export function orgToolsQueryKey(orgId: string) {
  return ['orgs', orgId, 'tools'] as const;
}

export function listOrgTools(orgId: string) {
  return apiJson<ListOrgToolsResponse>(`${orgBase(orgId)}/tools`);
}

export function orgToolsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgToolsQueryKey(orgId),
    queryFn: () => listOrgTools(orgId),
    enabled: Boolean(orgId),
    staleTime: 20000,
  });
}

export function orgAgentCapabilitiesQueryKey(orgId: string, agentId: string) {
  return ['orgs', orgId, 'agents', agentId, 'capabilities'] as const;
}

export function getOrgAgentCapabilities(orgId: string, agentId: string) {
  return apiJson<AgentCapabilitiesView>(
    `${orgBase(orgId)}/agents/${encodeURIComponent(agentId)}/capabilities`,
  );
}

export function orgAgentCapabilitiesQuery(orgId: string, agentId: string | null) {
  return queryOptions({
    queryKey: orgAgentCapabilitiesQueryKey(orgId, agentId ?? 'new'),
    queryFn: () => getOrgAgentCapabilities(orgId, agentId as string),
    enabled: Boolean(orgId && agentId),
    staleTime: 15000,
  });
}
