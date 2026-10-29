import type { RepositoryWorktree as PublicWorktree } from '@harnesys/contracts';
import type {
  RepositoryWorktree,
  WorktreeGitObservation,
} from '../../domain/source/repository-worktree.ts';

export function toPublicWorktree(
  row: RepositoryWorktree,
  observation: WorktreeGitObservation | null,
): PublicWorktree {
  return {
    id: row.id,
    orgId: row.orgId,
    sourceId: row.sourceId,
    hostId: row.hostId,
    branch: row.branch,
    baseCommit: row.baseCommit,
    state: row.state,
    activeRunId: row.activeRunId,
    operationId: row.operationId,
    issueId: row.issueId,
    lastErrorCode: row.lastErrorCode,
    dirty: observation?.dirty ?? null,
    unpushed: observation?.unpushed ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
