import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeHit,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { isSearchableQuery } from '@/shared/lib/searchable-query';
import { apiJson } from './client';

export interface SearchKnowledgeParams {
  query: string;
  limit?: number;
}
export interface ListKnowledgeFilesParams {
  status?: KnowledgeFileStatus;
}

function knowledgeBase(orgId: string, sourceId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/knowledge`;
}

export function knowledgeRootsQueryKey(orgId: string, sourceId: string) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'roots'] as const;
}
export function knowledgeStatsQueryKey(orgId: string, sourceId: string) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'stats'] as const;
}
export function knowledgeSettingsQueryKey(orgId: string, sourceId: string) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'settings'] as const;
}
export function knowledgeFilesQueryKey(
  orgId: string,
  sourceId: string,
  status?: KnowledgeFileStatus,
) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'files', status ?? 'all'] as const;
}
export function knowledgeIndexStateQueryKey(orgId: string, sourceId: string) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'index-state'] as const;
}
export function knowledgeIndexStatesQueryKey(orgId: string) {
  return ['orgs', orgId, 'knowledge', 'index-states'] as const;
}
export function listKnowledgeRoots(orgId: string, sourceId: string) {
  return apiJson<KnowledgeRootRecord[]>(`${knowledgeBase(orgId, sourceId)}/roots`);
}
export function upsertKnowledgeRoot(
  orgId: string,
  sourceId: string,
  body: UpsertKnowledgeRootRequest,
) {
  return apiJson<KnowledgeRootRecord>(`${knowledgeBase(orgId, sourceId)}/roots`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
export function deleteKnowledgeRoot(orgId: string, sourceId: string, path: string) {
  const query = new URLSearchParams({ path });
  return apiJson<void>(`${knowledgeBase(orgId, sourceId)}/roots?${query}`, {
    method: 'DELETE',
  });
}
export function getKnowledgeSettings(orgId: string, sourceId: string) {
  return apiJson<KnowledgeSettings>(`${knowledgeBase(orgId, sourceId)}/settings`);
}
export function putKnowledgeSettings(
  orgId: string,
  sourceId: string,
  body: UpsertKnowledgeSettingsRequest,
) {
  return apiJson<KnowledgeSettings>(`${knowledgeBase(orgId, sourceId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}
export function listKnowledgeFiles(
  orgId: string,
  sourceId: string,
  params: ListKnowledgeFilesParams = {},
) {
  const search = new URLSearchParams();
  if (params.status) {
    search.set('status', params.status);
  }
  const query = search.toString();
  const suffix = query ? `?${query}` : '';
  return apiJson<KnowledgeFileRecord[]>(`${knowledgeBase(orgId, sourceId)}/files${suffix}`);
}
export function getKnowledgeIndexState(orgId: string, sourceId: string) {
  return apiJson<KnowledgeIndexState>(`${knowledgeBase(orgId, sourceId)}/index-state`);
}
export function listKnowledgeIndexStates(orgId: string) {
  return apiJson<KnowledgeIndexState[]>(
    `/api/orgs/${encodeURIComponent(orgId)}/knowledge/index-states`,
  );
}
export function getKnowledgeStats(orgId: string, sourceId: string) {
  return apiJson<KnowledgeStats>(`${knowledgeBase(orgId, sourceId)}/stats`);
}
export function reindexKnowledge(orgId: string, sourceId: string) {
  return apiJson<KnowledgeIndexState>(`${knowledgeBase(orgId, sourceId)}/reindex`, {
    method: 'POST',
  });
}
export function cancelKnowledgeIndex(orgId: string, sourceId: string) {
  return apiJson<KnowledgeIndexState>(`${knowledgeBase(orgId, sourceId)}/cancel`, {
    method: 'POST',
  });
}
export function searchKnowledge(orgId: string, sourceId: string, params: SearchKnowledgeParams) {
  const search = new URLSearchParams({ query: params.query });
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  return apiJson<KnowledgeHit[]>(`${knowledgeBase(orgId, sourceId)}/search?${search}`);
}

export function knowledgeSearchQueryKey(orgId: string, sourceId: string, query: string) {
  return ['orgs', orgId, 'sources', sourceId, 'knowledge', 'search', query] as const;
}

export function knowledgeSearchQuery(orgId: string, sourceId: string, query: string) {
  return queryOptions({
    queryKey: knowledgeSearchQueryKey(orgId, sourceId, query),
    queryFn: () => searchKnowledge(orgId, sourceId, { query, limit: 8 }),
    enabled: Boolean(orgId && sourceId) && isSearchableQuery(query),
    staleTime: 10_000,
  });
}
export function knowledgeRootsQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: knowledgeRootsQueryKey(orgId, sourceId),
    queryFn: () => listKnowledgeRoots(orgId, sourceId),
    staleTime: 10000,
    enabled: Boolean(orgId && sourceId),
  });
}
export function knowledgeStatsQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: knowledgeStatsQueryKey(orgId, sourceId),
    queryFn: () => getKnowledgeStats(orgId, sourceId),
    staleTime: 10000,
    enabled: Boolean(orgId && sourceId),
  });
}
export function knowledgeSettingsQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: knowledgeSettingsQueryKey(orgId, sourceId),
    queryFn: () => getKnowledgeSettings(orgId, sourceId),
    staleTime: 10000,
    enabled: Boolean(orgId && sourceId),
  });
}
export function knowledgeFilesQuery(
  orgId: string,
  sourceId: string,
  params: ListKnowledgeFilesParams = {},
) {
  return queryOptions({
    queryKey: knowledgeFilesQueryKey(orgId, sourceId, params.status),
    queryFn: () => listKnowledgeFiles(orgId, sourceId, params),
    staleTime: 5000,
    enabled: Boolean(orgId && sourceId),
  });
}
export function knowledgeIndexStateQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: knowledgeIndexStateQueryKey(orgId, sourceId),
    queryFn: () => getKnowledgeIndexState(orgId, sourceId),
    staleTime: 2000,
    enabled: Boolean(orgId && sourceId),
  });
}
export function knowledgeIndexStatesQuery(orgId: string) {
  return queryOptions({
    queryKey: knowledgeIndexStatesQueryKey(orgId),
    queryFn: () => listKnowledgeIndexStates(orgId),
    staleTime: 10_000,
    enabled: Boolean(orgId),
  });
}
