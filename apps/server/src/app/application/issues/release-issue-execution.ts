import type { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution } from '../../domain/issue/issue-execution.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';

export interface ReleaseIssueExecutionDeps {
  orgId: string;
  issueExecutions?: IssueExecutionPort;
  events?: IssueEventsPort;
  worktrees?: RepositoryWorktreePort;
}

export function releaseIssueExecution(
  deps: ReleaseIssueExecutionDeps,
  runId: string,
  at: string,
): IssueExecution | null {
  const released = deps.issueExecutions?.releaseByRunId(deps.orgId, runId, at) ?? null;
  deps.worktrees?.clearActiveRun(deps.orgId, runId, at);
  if (released !== null) {
    deps.events?.emit(deps.orgId, {
      type: 'issue-execution-settled',
      issueId: released.issueId,
      runId,
      agentId: released.agentId,
    });
  }
  return released;
}
