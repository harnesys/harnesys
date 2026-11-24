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

export interface OrgAuditQuery {
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
  action?: string;
  actorKind?: string;
  result?: string;
  actorId?: string;
  q?: string;
}

export const AUDIT_PAGE_SIZE = 50;

export function orgAuditQueryKey(orgId: string, query: OrgAuditQuery) {
  return ['orgs', orgId, 'audit', query] as const;
}

function setParam(params: URLSearchParams, key: string, value: string | number | undefined): void {
  if (value !== undefined && value !== '') {
    params.set(key, String(value));
  }
}

export function listOrgAudit(orgId: string, query: OrgAuditQuery): Promise<OrgAuditPage> {
  const params = new URLSearchParams();
  setParam(params, 'limit', query.limit);
  setParam(params, 'offset', query.offset);
  setParam(params, 'from', query.from);
  setParam(params, 'to', query.to);
  setParam(params, 'action', query.action);
  setParam(params, 'actorKind', query.actorKind);
  setParam(params, 'result', query.result);
  setParam(params, 'actorId', query.actorId);
  setParam(params, 'q', query.q);
  return apiJson<OrgAuditPage>(`/api/orgs/${encodeURIComponent(orgId)}/audit?${params.toString()}`);
}

export function orgAuditPageOptions(orgId: string, query: OrgAuditQuery) {
  return queryOptions({
    queryKey: orgAuditQueryKey(orgId, query),
    queryFn: () => listOrgAudit(orgId, query),
    enabled: Boolean(orgId),
  });
}
