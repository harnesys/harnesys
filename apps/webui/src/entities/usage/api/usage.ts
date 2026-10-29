import { apiJson } from '@/shared/api/client';
import type {
  PriceOverride,
  PriceOverridesResponse,
  UsageGroupBy,
  UsageReport,
  UsageRunsReport,
} from '../model/usage';

function usageBase(orgId: string) {
  return `/api/orgs/${orgId}/usage`;
}

export function getUsage(
  orgId: string,
  params: { groupBy?: UsageGroupBy; from?: string; to?: string; agents?: string[] },
): Promise<UsageReport> {
  const search = new URLSearchParams();
  if (params.groupBy) {
    search.set('groupBy', params.groupBy);
  }
  if (params.from) {
    search.set('from', params.from);
  }
  if (params.to) {
    search.set('to', params.to);
  }
  if (params.agents && params.agents.length > 0) {
    search.set('agents', params.agents.join(','));
  }
  return apiJson<UsageReport>(`${usageBase(orgId)}?${search.toString()}`);
}

export function getUsageRuns(
  orgId: string,
  params: { from?: string; to?: string; limit?: number },
): Promise<UsageRunsReport> {
  const search = new URLSearchParams();
  if (params.from) {
    search.set('from', params.from);
  }
  if (params.to) {
    search.set('to', params.to);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  return apiJson<UsageRunsReport>(`${usageBase(orgId)}/runs?${search.toString()}`);
}

export function getPriceOverrides(orgId: string): Promise<PriceOverridesResponse> {
  return apiJson<PriceOverridesResponse>(`${usageBase(orgId)}/price-overrides`);
}

export function setPriceOverride(
  orgId: string,
  body: { modelId: string; inputPer1M: number; outputPer1M: number },
): Promise<PriceOverride> {
  return apiJson<PriceOverride>(`${usageBase(orgId)}/price-overrides`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deletePriceOverride(orgId: string, modelId: string): Promise<{ removed: boolean }> {
  return apiJson<{ removed: boolean }>(
    `${usageBase(orgId)}/price-overrides/${encodeURIComponent(modelId)}`,
    { method: 'DELETE' },
  );
}
