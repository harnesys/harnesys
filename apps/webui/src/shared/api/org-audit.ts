import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export interface OrgAuditItem {
  id: string;
  at: string;
  actorKind: string;
  actorId: string;
  viaNodeId: string | null;
  action: string;
  resource: string;
  result: string;
}

export interface OrgAuditPage {
  items: OrgAuditItem[];
  total: number;
}

export const AUDIT_PAGE_SIZE = 50;

export function orgAuditQueryKey(orgId: string) {
  return ['orgs', orgId, 'audit'] as const;
}

export function listOrgAudit(orgId: string, offset: number): Promise<OrgAuditPage> {
  const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) });
  return apiJson<OrgAuditPage>(`/api/orgs/${encodeURIComponent(orgId)}/audit?${params.toString()}`);
}

export function orgAuditPageOptions(orgId: string, offset: number) {
  return queryOptions({
    queryKey: [...orgAuditQueryKey(orgId), offset],
    queryFn: () => listOrgAudit(orgId, offset),
    enabled: Boolean(orgId),
  });
}
