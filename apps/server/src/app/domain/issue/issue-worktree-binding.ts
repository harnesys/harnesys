export type IssueWorkspacePlan = 'worktree' | 'checkout' | 'blocked';

export interface ResolveIssueWorkspacePlanInput {
  branch: string | null;
  activeBranch: string | null;
  hasWorktree: boolean;
}

export function resolveIssueWorkspacePlan(
  input: ResolveIssueWorkspacePlanInput,
): IssueWorkspacePlan {
  if (input.hasWorktree) {
    return 'worktree';
  }
  if (
    input.branch !== null &&
    input.activeBranch !== null &&
    input.branch.trim().toLowerCase() === input.activeBranch.trim().toLowerCase()
  ) {
    return 'checkout';
  }
  return 'blocked';
}

export interface IssueBranchColumns {
  branch: string | null;
  worktreeBaseBranch: string | null;
}

export function resolveIssueBranch(columns: IssueBranchColumns): string | null {
  return columns.branch ?? columns.worktreeBaseBranch;
}
