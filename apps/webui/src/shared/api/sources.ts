import type { SourceHostStatus, SourceHostStatusResponse } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiUrl } from './client';
import { selfNodeCached } from './fleet';
import { authenticatedFetch } from './session';

export type { SourceHostStatus, SourceHostStatusResponse };

export type SourceDistributionKind = 'host-bound' | 'cloud-drive';

export type SourceDistribution =
  | { kind: 'host-bound'; hostId: string }
  | {
      kind: 'cloud-drive';
      backend: 'google';
      remoteFolderId: string;
      integrationId: string;
    };

export interface SourceVcs {
  engine: 'git';
  remoteUrl: string | null;
  credRef: string | null;
  defaultBranch: string | null;
  integrationId?: string | null;
}

export interface Source {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  distribution: SourceDistribution;
  uiVisibility: 'org' | 'host';
  managed: boolean;
  vcs: SourceVcs | null;
  availability: { hostIds: string[] };
  createdAt: string;
  updatedAt: string;
}

export interface SourcesListResponse {
  sources: Source[];
}

export interface AttachLocalFolderInput {
  absolutePath: string;
  name?: string;
  hostId?: string;
  uiVisibility?: 'org' | 'host';
}

export interface AttachGitInput {
  url?: string;
  name?: string;
  hostId?: string;
  uiVisibility?: 'org' | 'host';
  branch?: string;
  credRef?: string;
  integrationId?: string;
  repo?: string;
}

export interface AttachCloudDriveInput {
  name?: string;
  backend?: 'google';
  remoteFolderId?: string;
  integrationId: string;
  hostId?: string;
  uiVisibility?: 'org' | 'host';
}

async function apiJson<T>(path: string, init?: RequestInit & { orgId?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.orgId) {
    headers.set('X-Org-Id', init.orgId);
  }
  const surfaceHostId = selfNodeCached();
  if (surfaceHostId) {
    headers.set('X-Surface-Host-Id', surfaceHostId);
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { orgId: _orgId, ...rest } = init ?? {};
  const response = await authenticatedFetch(apiUrl(path), { ...rest, headers });
  if (response.status === 204) {
    return undefined as T;
  }
  const body = await readBody(response);
  if (!response.ok) {
    throw makeApiError(response, body);
  }
  return body as T;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function makeApiError(response: Response, body: unknown): Error {
  const message =
    body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message
      : response.statusText || `request failed (${response.status})`;
  const errorCode =
    body && typeof body === 'object' && 'errorCode' in body && typeof body.errorCode === 'string'
      ? body.errorCode
      : null;
  const err = new Error(message) as Error & { status?: number; errorCode?: string | null };
  err.status = response.status;
  err.errorCode = errorCode;
  return err;
}

export function listSources(orgId: string): Promise<SourcesListResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources`);
}

export function sourceHostStatusQueryKey(orgId: string, sourceId: string) {
  return ['sources', orgId, sourceId, 'host-status'] as const;
}

export function getSourceHostStatus(
  orgId: string,
  sourceId: string,
): Promise<SourceHostStatusResponse> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/host-status`,
  );
}

export function sourceHostStatusQuery(orgId: string, sourceId: string) {
  return queryOptions({
    queryKey: sourceHostStatusQueryKey(orgId, sourceId),
    queryFn: () => getSourceHostStatus(orgId, sourceId),
    enabled: Boolean(orgId && sourceId),
  });
}

export interface PrepareGitSourceResponse {
  sourceId: string;
  hostId: string;
  operationId: string;
  state: 'absent' | 'materializing' | 'ready' | 'failed';
  worktreeId: string | null;
}

export function prepareGitSource(
  orgId: string,
  sourceId: string,
  hostId: string,
): Promise<PrepareGitSourceResponse> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/prepare`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId }),
    },
  );
}

export function attachLocalFolder(orgId: string, input: AttachLocalFolderInput): Promise<Source> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function attachGit(orgId: string, input: AttachGitInput): Promise<Source> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources/git`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function attachCloudDrive(orgId: string, input: AttachCloudDriveInput): Promise<Source> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources/cloud`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function refreshGitSource(
  orgId: string,
  sourceId: string,
  hostId: string,
  worktreeId?: string,
): Promise<Source> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git/refresh`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId, ...(worktreeId ? { worktreeId } : {}) }),
    },
  );
}

export interface CloudRefreshResult {
  source: Source;
  skippedGoogleApps: number;
  state: 'materializing' | 'ready' | 'failed';
  conflicts: string[];
}

export function refreshCloudDrive(
  orgId: string,
  sourceId: string,
  hostId: string,
): Promise<CloudRefreshResult> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/cloud/refresh`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId }),
    },
  );
}

export function switchGitBranch(
  orgId: string,
  sourceId: string,
  branch: string,
  hostId: string,
  worktreeId: string,
): Promise<Source> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git/branch`,
    {
      method: 'POST',
      body: JSON.stringify({ branch, hostId, worktreeId }),
    },
  );
}

export function deleteGitBranch(
  orgId: string,
  sourceId: string,
  branch: string,
  hostId: string,
): Promise<Source> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git/branch/delete`,
    {
      method: 'POST',
      body: JSON.stringify({ branch, hostId }),
    },
  );
}

export interface GitBranchesResponse {
  branches: string[];
  activeBranch: string;
}

export function listGitBranches(
  orgId: string,
  sourceId: string,
  hostId: string,
): Promise<GitBranchesResponse> {
  const q = new URLSearchParams({ hostId });
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git/branches?${q.toString()}`,
  );
}

export function detachSource(orgId: string, sourceId: string): Promise<void> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
}

export function setSourceVisibility(
  orgId: string,
  sourceId: string,
  uiVisibility: 'org' | 'host',
): Promise<Source> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/visibility`,
    {
      method: 'PATCH',
      body: JSON.stringify({ uiVisibility }),
    },
  );
}

export function renameSource(orgId: string, sourceId: string, name: string): Promise<Source> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function updateSourceAvailability(
  orgId: string,
  sourceId: string,
  hostIds: string[],
): Promise<unknown> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/availability`,
    {
      method: 'PATCH',
      body: JSON.stringify({ hostIds }),
    },
  );
}

export function sourceHasGitVcs(source: { vcs: SourceVcs | null }): boolean {
  return source.vcs !== null;
}

export function sourceBoundHostId(source: Source): string | null {
  return source.distribution.kind === 'host-bound' ? source.distribution.hostId : null;
}

export function sourceDisplayPath(source: Source): string {
  if (source.distribution.kind === 'cloud-drive') {
    return `google:${source.distribution.remoteFolderId}`;
  }
  return `host:${source.distribution.hostId}`;
}
