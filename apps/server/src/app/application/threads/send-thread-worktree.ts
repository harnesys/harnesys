import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { WorktreeNotFoundException } from '../../domain/source/source.error.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';

export interface WorktreeBinding {
  sourceId: string;
  worktreeId: string;
  hostId: string;
}

export function resolveWorktreeBinding(input: {
  orgId: string;
  sourceId?: string;
  worktreeId?: string;
  agentSharedSourceIds: string[];
  worktrees: RepositoryWorktreePort;
}): WorktreeBinding | null {
  const sourceId = input.sourceId;
  const worktreeId = input.worktreeId;
  if (!sourceId || !worktreeId) {
    return null;
  }
  if (!input.agentSharedSourceIds.includes(sourceId)) {
    throw new ThreadValidationException(`worktree source not shared with agent: ${sourceId}`);
  }
  const row = input.worktrees.findById(input.orgId, worktreeId);
  if (!row || row.sourceId !== sourceId) {
    throw new WorktreeNotFoundException(worktreeId);
  }
  if (row.state !== 'ready') {
    throw new ThreadValidationException(`worktree ${worktreeId} is not ready`);
  }
  return { sourceId, worktreeId, hostId: row.hostId };
}
