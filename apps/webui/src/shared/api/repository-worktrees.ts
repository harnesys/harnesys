import { apiJson } from './client';

export interface RepositoryWorktree {
  id: string;
  orgId: string;
  sourceId: string;
  hostId: string;
  branch: string;
  baseCommit: string | null;
  state: 'creating' | 'ready' | 'failed' | 'removing';
  activeRunId: string | null;
  operationId: string;
  issueId: string | null;
  lastErrorCode: string | null;
  dirty: boolean | null;
  unpushed: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export function repositoryWorktreesQueryKey(orgId: string, sourceId: string) {
  return ['sources', orgId, sourceId, 'worktrees'] as const;
}

export function listRepositoryWorktrees(
  orgId: string,
  sourceId: string,
): Promise<{ worktrees: RepositoryWorktree[] }> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/worktrees`,
  );
}

export function createRepositoryWorktree(
  orgId: string,
  sourceId: string,
  body: {
    hostId: string;
    operationId: string;
    branch: string;
    createBranch?: boolean;
    from?: string;
  },
): Promise<RepositoryWorktree> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/worktrees`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );
}

export function deleteRepositoryWorktree(
  orgId: string,
  sourceId: string,
  worktreeId: string,
): Promise<{ worktreeId: string; operationId: string; result: 'removed' | 'failed' }> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/worktrees/${encodeURIComponent(worktreeId)}`,
    { method: 'DELETE' },
  );
}
