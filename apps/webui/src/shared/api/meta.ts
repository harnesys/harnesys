import { queryOptions } from '@tanstack/react-query';
import { getActiveOrgId } from './active-org';
import { apiJson } from './client';

export interface AppMeta {
  version: string;
  nodeId: string | null;
}

export function getActiveHost(orgId: string): Promise<{ hostId: string; version: string }> {
  return apiJson<{ hostId: string; version: string }>(
    `/api/orgs/${encodeURIComponent(orgId)}/active-host`,
  );
}

export function getAppMeta(orgId?: string | null): Promise<AppMeta> {
  const resolved = orgId ?? getActiveOrgId();
  if (!resolved) {
    return Promise.resolve({ version: '0.0.0', nodeId: null });
  }
  return getActiveHost(resolved)
    .then((response) => ({ version: response.version, nodeId: response.hostId }))
    .catch(() => ({ version: '0.0.0', nodeId: null }));
}

export function appMetaQuery(orgId?: string | null) {
  return queryOptions({
    queryKey: ['app-meta', orgId ?? null] as const,
    queryFn: () => getAppMeta(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
