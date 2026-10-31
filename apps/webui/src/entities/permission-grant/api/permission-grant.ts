import type { ListPermissionGrantsResponse, PermissionGrantPublic } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { PermissionGrantPublic };

export const permissionGrantsQueryKey = ['permission-grants'] as const;

function permissionGrantsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/permission-grants`;
}

export function permissionGrantsQuery(orgId: string, agentId?: string | null) {
  return queryOptions({
    queryKey: [...permissionGrantsQueryKey, orgId, agentId ?? null] as const,
    queryFn: () => {
      const search = new URLSearchParams();
      if (agentId) {
        search.set('agentId', agentId);
      }
      const suffix = search.size > 0 ? `?${search.toString()}` : '';
      return apiJson<ListPermissionGrantsResponse>(`${permissionGrantsBase(orgId)}${suffix}`);
    },
    enabled: Boolean(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function revokePermissionGrant(orgId: string, grantId: string) {
  return apiJson<void>(`${permissionGrantsBase(orgId)}/${encodeURIComponent(grantId)}`, {
    method: 'DELETE',
  });
}
