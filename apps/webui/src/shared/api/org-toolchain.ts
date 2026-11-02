import type { ToolchainDiscovery } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type { ToolchainDiscovery };

export function orgToolchainQueryKey(orgId: string) {
  return ['orgs', orgId, 'toolchain'] as const;
}

function toolchainBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/toolchain`;
}

export function getOrgToolchain(orgId: string) {
  return apiJson<ToolchainDiscovery>(toolchainBase(orgId));
}

export function orgToolchainQuery(orgId: string) {
  return queryOptions({
    queryKey: orgToolchainQueryKey(orgId),
    queryFn: () => getOrgToolchain(orgId),
    enabled: Boolean(orgId),
  });
}

export function refreshOrgToolchain(orgId: string): Promise<ToolchainDiscovery> {
  return apiJson<ToolchainDiscovery>(`${toolchainBase(orgId)}/refresh`, { method: 'POST' });
}
