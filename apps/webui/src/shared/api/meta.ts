import { queryOptions } from '@tanstack/react-query';
import { getActiveOrgId } from './active-org';
import { apiJson } from './client';

export interface AppMeta {
  version: string;
  nodeId: string | null;
}

export function getActiveHost(orgId: string): Promise<{ hostId: string }> {
  return apiJson<{ hostId: string }>(`/api/orgs/${encodeURIComponent(orgId)}/active-host`);
}

export function getAppMeta(): Promise<AppMeta> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.resolve({ version: '0.0.0', nodeId: null });
  }
  return getActiveHost(orgId)
    .then((response) => ({ version: '0.0.0', nodeId: response.hostId }))
    .catch(() => ({ version: '0.0.0', nodeId: null }));
}

export const appMetaQuery = queryOptions({
  queryKey: ['app-meta'] as const,
  queryFn: getAppMeta,
  staleTime: Number.POSITIVE_INFINITY,
});
