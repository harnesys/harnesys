import type {
  CreatePermissionRuleBody,
  ListPermissionRulesResponse,
  PermissionRulePublic,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { PermissionRulePublic };

export const permissionRulesQueryKey = ['permission-rules'] as const;

function permissionRulesBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/permission-rules`;
}

export function permissionRulesQuery(orgId: string) {
  return queryOptions({
    queryKey: [...permissionRulesQueryKey, orgId] as const,
    queryFn: () => apiJson<ListPermissionRulesResponse>(permissionRulesBase(orgId)),
    enabled: Boolean(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function createPermissionRule(orgId: string, body: CreatePermissionRuleBody) {
  return apiJson<void>(permissionRulesBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function revokePermissionRule(orgId: string, ruleId: string) {
  return apiJson<void>(`${permissionRulesBase(orgId)}/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}
