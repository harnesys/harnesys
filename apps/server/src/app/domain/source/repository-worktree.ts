export type RepositoryWorktreeState = 'creating' | 'ready' | 'failed' | 'removing';

export interface RepositoryWorktree {
  id: string;
  orgId: string;
  sourceId: string;
  hostId: string;
  branch: string;
  baseCommit: string | null;
  state: RepositoryWorktreeState;
  activeRunId: string | null;
  operationId: string;
  issueId: string | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeGitObservation {
  dirty: boolean;
  unpushed: boolean;
  branch: string | null;
  head: string | null;
}

export interface WorktreeDeleteBlockers {
  activeRun: boolean;
  dirty: boolean;
  unpushed: boolean;
}

export function worktreeDeleteBlockers(input: {
  activeRunId: string | null;
  observation: WorktreeGitObservation | null;
}): WorktreeDeleteBlockers {
  return {
    activeRun: Boolean(input.activeRunId),
    dirty: input.observation?.dirty === true,
    unpushed: input.observation?.unpushed === true,
  };
}

export function canDeleteWorktree(blockers: WorktreeDeleteBlockers): boolean {
  return !blockers.activeRun && !blockers.dirty && !blockers.unpushed;
}

export function explainWorktreeDeleteBlock(blockers: WorktreeDeleteBlockers): string | null {
  if (canDeleteWorktree(blockers)) {
    return null;
  }
  const reasons: string[] = [];
  if (blockers.activeRun) {
    reasons.push('active run');
  }
  if (blockers.dirty) {
    reasons.push('uncommitted changes');
  }
  if (blockers.unpushed) {
    reasons.push('unpushed commits');
  }
  return `worktree cannot be deleted: ${reasons.join(', ')}`;
}

export function isActiveWorktreeState(state: RepositoryWorktreeState): boolean {
  return state === 'creating' || state === 'ready' || state === 'removing';
}

export type StaleCreatingRecoveryAction =
  | { kind: 'keep' }
  | { kind: 'adopt'; head: string }
  | { kind: 'fail'; reason: 'STALE_CREATING_MISSING' | 'STALE_CREATING_TIMEOUT' };

export function decideStaleCreatingRecovery(input: {
  isLocalHost: boolean;
  head: string | null;
  ageMs: number;
  localGraceMs: number;
  remoteStaleMs: number;
}): StaleCreatingRecoveryAction {
  if (!Number.isFinite(input.ageMs)) {
    return { kind: 'keep' };
  }
  if (input.isLocalHost) {
    if (input.ageMs < input.localGraceMs) {
      return { kind: 'keep' };
    }
    return input.head
      ? { kind: 'adopt', head: input.head }
      : { kind: 'fail', reason: 'STALE_CREATING_MISSING' };
  }
  return input.ageMs >= input.remoteStaleMs
    ? { kind: 'fail', reason: 'STALE_CREATING_TIMEOUT' }
    : { kind: 'keep' };
}
