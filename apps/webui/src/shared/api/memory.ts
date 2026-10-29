import type { MemoryRecord, PinRecord, SemanticScope } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
export interface UpsertPinBody {
  text: string;
}
export interface UpsertSemanticBody {
  scope: SemanticScope;
  text: string;
  key?: string;
  threadId?: string;
}
export interface UpdateSemanticBody {
  text: string;
}
export interface ListSemanticParams {
  scope?: SemanticScope;
  limit?: number;
}
export function agentPinsQueryKey(projectId: string, agentId: string) {
  return ['projects', projectId, 'agents', agentId, 'pins'] as const;
}
export function agentSemanticQueryKey(projectId: string, agentId: string, scope?: SemanticScope) {
  return ['projects', projectId, 'agents', agentId, 'semantic', scope ?? 'all'] as const;
}
export function listAgentPins(projectId: string, agentId: string) {
  return apiJson<PinRecord[]>(`/api/orgs/${projectId}/agents/${agentId}/pins`);
}
export function upsertAgentPin(
  projectId: string,
  agentId: string,
  key: string,
  body: UpsertPinBody,
) {
  return apiJson<PinRecord>(
    `/api/orgs/${projectId}/agents/${agentId}/pins/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
  );
}
export function deleteAgentPin(projectId: string, agentId: string, key: string) {
  return apiJson<void>(`/api/orgs/${projectId}/agents/${agentId}/pins/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}
export function agentPinsQuery(projectId: string, agentId: string) {
  return queryOptions({
    queryKey: agentPinsQueryKey(projectId, agentId),
    queryFn: () => listAgentPins(projectId, agentId),
    staleTime: 10000,
  });
}
export function listAgentSemantic(
  projectId: string,
  agentId: string,
  params: ListSemanticParams = {},
) {
  const search = new URLSearchParams();
  if (params.scope) {
    search.set('scope', params.scope);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  const suffix = query ? `?${query}` : '';
  return apiJson<MemoryRecord[]>(`/api/orgs/${projectId}/agents/${agentId}/semantic${suffix}`);
}
export function upsertAgentSemantic(projectId: string, agentId: string, body: UpsertSemanticBody) {
  return apiJson<MemoryRecord>(`/api/orgs/${projectId}/agents/${agentId}/semantic`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updateAgentSemantic(
  projectId: string,
  agentId: string,
  id: string,
  body: UpdateSemanticBody,
) {
  return apiJson<MemoryRecord>(`/api/orgs/${projectId}/agents/${agentId}/semantic/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function deleteAgentSemantic(projectId: string, agentId: string, id: string) {
  return apiJson<void>(`/api/orgs/${projectId}/agents/${agentId}/semantic/${id}`, {
    method: 'DELETE',
  });
}
export function agentSemanticQuery(
  projectId: string,
  agentId: string,
  params: ListSemanticParams = {},
) {
  return queryOptions({
    queryKey: agentSemanticQueryKey(projectId, agentId, params.scope),
    queryFn: () => listAgentSemantic(projectId, agentId, params),
    staleTime: 10000,
  });
}
export interface MemoryEmbeddingStatus {
  provider: string;
  model: string;
}
export interface MemoryLastPassStatus {
  at: string;
  summary: string;
}
export interface MemoryStatusResponse {
  embeddingsAvailable: boolean;
  embedding: MemoryEmbeddingStatus | null;
  embedPinned: boolean;
  decision: MemoryEmbeddingStatus | null;
  decisionPinned: boolean;
  lastPass: MemoryLastPassStatus | null;
}
export interface SaveMemorySettingsBody {
  embedModelId?: string | null;
  decisionModelId?: string | null;
}
export function memoryStatusQueryKey(orgId: string) {
  return ['orgs', orgId, 'memory', 'status'] as const;
}
export function getMemoryStatus(orgId: string) {
  return apiJson<MemoryStatusResponse>(`/api/orgs/${encodeURIComponent(orgId)}/memory/status`);
}
export function saveMemorySettings(orgId: string, body: SaveMemorySettingsBody) {
  return apiJson<MemoryStatusResponse>(`/api/orgs/${encodeURIComponent(orgId)}/memory/settings`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
export function runMemoryPass(orgId: string) {
  return apiJson<MemoryStatusResponse>(`/api/orgs/${encodeURIComponent(orgId)}/memory/run`, {
    method: 'POST',
  });
}
export function memoryStatusQuery(orgId: string) {
  return queryOptions({
    queryKey: memoryStatusQueryKey(orgId),
    queryFn: () => getMemoryStatus(orgId),
    staleTime: 30000,
    enabled: Boolean(orgId),
  });
}

export interface MemoryPromotionRow {
  id: string;
  factId: string;
  text: string;
  createdAt: string;
}
export interface MemoryPromotionDecision {
  id: string;
  status: 'approved' | 'rejected';
}
export function agentMemoryPromotionsQueryKey(orgId: string, agentId: string) {
  return ['orgs', orgId, 'agents', agentId, 'memory', 'promotions'] as const;
}
function memoryPromotionsBase(orgId: string, agentId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/memory/promotions`;
}
export function listMemoryPromotions(orgId: string, agentId: string) {
  return apiJson<MemoryPromotionRow[]>(memoryPromotionsBase(orgId, agentId));
}
export function approveMemoryPromotion(orgId: string, agentId: string, promotionId: string) {
  return apiJson<MemoryPromotionDecision>(
    `${memoryPromotionsBase(orgId, agentId)}/${encodeURIComponent(promotionId)}/approve`,
    { method: 'POST' },
  );
}
export function rejectMemoryPromotion(orgId: string, agentId: string, promotionId: string) {
  return apiJson<MemoryPromotionDecision>(
    `${memoryPromotionsBase(orgId, agentId)}/${encodeURIComponent(promotionId)}/reject`,
    { method: 'POST' },
  );
}
export function memoryPromotionsQuery(orgId: string, agentId: string) {
  return queryOptions({
    queryKey: agentMemoryPromotionsQueryKey(orgId, agentId),
    queryFn: () => listMemoryPromotions(orgId, agentId),
    staleTime: 10000,
    enabled: Boolean(orgId && agentId),
  });
}
