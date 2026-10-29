import type { FileRulePublic, ListFileRulesResponse } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { FileRulePublic };

export const fileRulesQueryKey = ['file-rules'] as const;

function fileRulesBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/file-rules`;
}

export function fileRulesQuery(orgId: string) {
  return queryOptions({
    queryKey: [...fileRulesQueryKey, orgId] as const,
    queryFn: () => apiJson<ListFileRulesResponse>(fileRulesBase(orgId)),
    enabled: Boolean(orgId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function createFileRule(
  orgId: string,
  body: {
    agentId?: string | null;
    hostId?: string | null;
    pathPattern: string;
    action: 'read' | 'edit';
    effect: 'allow' | 'deny';
  },
) {
  return apiJson<FileRulePublic>(fileRulesBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteFileRule(orgId: string, ruleId: string) {
  return apiJson<void>(`${fileRulesBase(orgId)}/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
}
