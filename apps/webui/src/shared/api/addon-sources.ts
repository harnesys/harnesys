import type { Source } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { addonBase, orgAddonDetailQueryKey } from './addons';
import { apiJson } from './client';

export interface AddonSourceKind {
  id: string;
  title: string;
  connection?: string;
  accountIds: string[];
  attached: number;
}

export interface AddonSourceKindsResponse {
  kinds: AddonSourceKind[];
}

export type AddonSourceEntryKind = 'file' | 'folder';

export interface AddonSourceEntry {
  id: string;
  name: string;
  kind: AddonSourceEntryKind;
  size?: number;
  modifiedAt?: string;
  mimeType?: string;
}

export interface AddonSourceBrowseResponse {
  entries: AddonSourceEntry[];
}

export interface BrowseAddonSourceBody {
  folderId?: string;
  accountId?: string;
}

export interface AttachAddonSourceBody {
  folderId: string;
  name?: string;
  accountId?: string;
}

export interface AddonSourcesResponse {
  sources: Source[];
}

export type AddonSourceRefreshState = 'materializing' | 'ready' | 'failed';

export interface AddonSourceRefreshResult {
  source: Source;
  skippedGoogleApps: number;
  state: AddonSourceRefreshState;
  conflicts: string[];
}

export function orgAddonSourceKindsQueryKey(orgId: string, addonId: string) {
  return [...orgAddonDetailQueryKey(orgId, addonId), 'source-kinds'] as const;
}

export function orgAddonSourceKindsQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: orgAddonSourceKindsQueryKey(orgId, addonId),
    queryFn: () => apiJson<AddonSourceKindsResponse>(`${addonBase(orgId, addonId)}/source-kinds`),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function orgAddonSourcesQueryKey(orgId: string, addonId: string) {
  return [...orgAddonDetailQueryKey(orgId, addonId), 'sources'] as const;
}

export function orgAddonSourcesQuery(orgId: string, addonId: string) {
  return queryOptions({
    queryKey: orgAddonSourcesQueryKey(orgId, addonId),
    queryFn: () => apiJson<AddonSourcesResponse>(`${addonBase(orgId, addonId)}/sources`),
    enabled: Boolean(orgId) && Boolean(addonId),
  });
}

export function browseOrgAddonSourceKind(
  orgId: string,
  addonId: string,
  sourceKindId: string,
  body: BrowseAddonSourceBody,
): Promise<AddonSourceBrowseResponse> {
  return apiJson<AddonSourceBrowseResponse>(
    `${addonBase(orgId, addonId)}/source-kinds/${encodeURIComponent(sourceKindId)}/browse`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function attachOrgAddonSource(
  orgId: string,
  addonId: string,
  sourceKindId: string,
  body: AttachAddonSourceBody,
): Promise<Source> {
  return apiJson<Source>(
    `${addonBase(orgId, addonId)}/source-kinds/${encodeURIComponent(sourceKindId)}/attach`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function refreshOrgAddonSource(
  orgId: string,
  addonId: string,
  sourceId: string,
): Promise<AddonSourceRefreshResult> {
  return apiJson<AddonSourceRefreshResult>(
    `${addonBase(orgId, addonId)}/sources/${encodeURIComponent(sourceId)}/refresh`,
    { method: 'POST' },
  );
}
