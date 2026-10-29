export const ACTIVE_BRANCH_KEY = 'active';

export function worktreeBranchKey(worktreeId: string): string {
  return `wt:${worktreeId}`;
}
