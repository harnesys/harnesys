import type { RepositoryWorktree, RepositoryWorktreeState } from './repository-worktree.ts';

export interface UpsertRepositoryWorktreeInput {
  id: string;
  orgId: string;
  sourceId: string;
  hostId: string;
  branch: string;
  baseCommit?: string | null;
  state: RepositoryWorktreeState;
  activeRunId?: string | null;
  operationId: string;
  issueId?: string | null;
  lastErrorCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export abstract class RepositoryWorktreePort {
  abstract findById(orgId: string, worktreeId: string): RepositoryWorktree | null;
  abstract findByOperationId(orgId: string, operationId: string): RepositoryWorktree | null;
  abstract findActiveByBranch(
    orgId: string,
    sourceId: string,
    hostId: string,
    branch: string,
  ): RepositoryWorktree | null;
  abstract listCreating(orgId: string): RepositoryWorktree[];
  abstract listForSource(orgId: string, sourceId: string): RepositoryWorktree[];
  abstract listForHost(orgId: string, sourceId: string, hostId: string): RepositoryWorktree[];
  abstract listForIssue(orgId: string, issueId: string): RepositoryWorktree[];
  abstract upsert(input: UpsertRepositoryWorktreeInput): RepositoryWorktree;
  abstract setState(
    orgId: string,
    worktreeId: string,
    patch: {
      state: RepositoryWorktreeState;
      baseCommit?: string | null;
      lastErrorCode?: string | null;
      updatedAt: string;
    },
  ): void;
  abstract setActiveRunId(
    orgId: string,
    worktreeId: string,
    activeRunId: string | null,
    updatedAt: string,
  ): void;
  abstract clearActiveRun(orgId: string, runId: string, updatedAt: string): void;
  abstract remove(orgId: string, worktreeId: string): void;
}
