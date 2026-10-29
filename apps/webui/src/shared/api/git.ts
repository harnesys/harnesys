import type {
  GitDiffResponse,
  GitFileStatusMap,
  GitSourceSummary,
  GitStatusResponse,
} from '@harnesys/studio-shared';
import type { QueryClient } from '@tanstack/react-query';
import { getActiveOrgId } from './active-org';
import { ApiError, apiJson } from './client';
import { selfNodeCached } from './fleet';
import { getSourceHostStatus, refreshGitSource, switchGitBranch } from './sources';

function orgSourceGitPath(sourceId: string, suffix: string): string {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git/${suffix}`;
}

async function resolveGitLocation(
  sourceId: string,
): Promise<{ hostId: string; worktreeId: string }> {
  const hostId = selfNodeCached();
  if (!hostId) {
    throw new ApiError(400, 'Host id is required');
  }
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  const status = await getSourceHostStatus(orgId, sourceId);
  const row = status.statuses.find((item) => item.hostId === hostId) ?? status.statuses[0];
  const worktreeId = row?.defaultWorktreeId;
  if (!worktreeId) {
    throw new ApiError(400, 'Prepare this source on the node before git operations');
  }
  return { hostId: row?.hostId ?? hostId, worktreeId };
}

export async function getGitStatus(projectId: string): Promise<GitStatusResponse> {
  const location = await resolveGitLocation(projectId);
  const q = new URLSearchParams(location);
  return apiJson(orgSourceGitPath(projectId, `status?${q.toString()}`));
}

export function initGit(projectId: string): Promise<{ ok: true }> {
  const hostId = selfNodeCached();
  const orgId = getActiveOrgId();
  if (!hostId || !orgId) {
    return Promise.reject(new ApiError(400, 'No active host or org'));
  }
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(projectId)}/git/init`,
    { method: 'POST', body: JSON.stringify({ hostId }) },
  );
}

export async function getGitFileStatus(
  projectId: string,
  subPath = '',
): Promise<{ map: GitFileStatusMap; truncated: boolean }> {
  const location = await resolveGitLocation(projectId);
  const q = new URLSearchParams({
    ...location,
    ...(subPath ? { path: subPath } : {}),
  });
  return apiJson(orgSourceGitPath(projectId, `file-status?${q.toString()}`));
}

export async function checkoutGitBranch(projectId: string, branch: string): Promise<{ ok: true }> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  const location = await resolveGitLocation(projectId);
  await switchGitBranch(orgId, projectId, branch, location.hostId, location.worktreeId);
  return { ok: true };
}

export async function createGitBranch(
  projectId: string,
  input: {
    name: string;
    checkout?: boolean;
    from?: string;
  },
): Promise<{ ok: true }> {
  const location = await resolveGitLocation(projectId);
  return apiJson(orgSourceGitPath(projectId, 'branches'), {
    method: 'POST',
    body: JSON.stringify({ ...input, ...location }),
  });
}

export async function commitGit(projectId: string, message: string): Promise<{ ok: true }> {
  const location = await resolveGitLocation(projectId);
  return apiJson(orgSourceGitPath(projectId, 'commit'), {
    method: 'POST',
    body: JSON.stringify({ message, ...location }),
  });
}

export async function pushGit(projectId: string): Promise<{ ok: true }> {
  const location = await resolveGitLocation(projectId);
  return apiJson(orgSourceGitPath(projectId, 'push'), {
    method: 'POST',
    body: JSON.stringify(location),
  });
}

export async function pullGit(projectId: string): Promise<{ ok: true }> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  const location = await resolveGitLocation(projectId);
  await refreshGitSource(orgId, projectId, location.hostId, location.worktreeId);
  return { ok: true };
}

export async function stageGit(projectId: string, paths: string[] = []): Promise<{ ok: true }> {
  const location = await resolveGitLocation(projectId);
  return apiJson(orgSourceGitPath(projectId, 'add'), {
    method: 'POST',
    body: JSON.stringify({ paths, ...location }),
  });
}

export async function getGitDiff(projectId: string, filePath: string): Promise<GitDiffResponse> {
  const location = await resolveGitLocation(projectId);
  const q = new URLSearchParams({ ...location, path: filePath });
  return apiJson(orgSourceGitPath(projectId, `diff?${q.toString()}`));
}

export function getOrgGitSummary(orgId: string): Promise<GitSourceSummary[]> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/git/summary`);
}

export const gitStatusQueryKey = (projectId: string) =>
  ['sources', projectId, 'git', 'status'] as const;
export const gitOrgSummaryQueryKey = (orgId: string) => ['orgs', orgId, 'git', 'summary'] as const;
export const gitFileStatusQueryKey = (projectId: string, subPath = '') =>
  ['sources', projectId, 'git', 'file-status', subPath] as const;
export function invalidateGitOrgSummary(qc: QueryClient): void {
  const orgId = getActiveOrgId();
  if (orgId) {
    void qc.invalidateQueries({ queryKey: gitOrgSummaryQueryKey(orgId) });
  }
}
export const gitDiffQueryKey = (projectId: string, filePath: string) =>
  ['sources', projectId, 'git', 'diff', filePath] as const;

export function setGitRemote(
  sourceId: string,
  input: { url: string; credRef?: string },
): Promise<unknown> {
  const orgId = getActiveOrgId();
  const hostId = selfNodeCached();
  if (!orgId || !hostId) {
    throw new ApiError(400, 'No active org or host');
  }
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/git-remote`,
    {
      method: 'POST',
      body: JSON.stringify({ hostId, url: input.url, credRef: input.credRef }),
    },
  );
}

export function refreshSourceVcs(sourceId: string): Promise<{ vcs: unknown }> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    throw new ApiError(400, 'No active org');
  }
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/refresh-vcs`,
    {
      method: 'POST',
    },
  );
}
