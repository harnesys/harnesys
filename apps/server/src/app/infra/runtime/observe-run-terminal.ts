import type { Logger, SessionEvent } from 'harnesys';
import { releaseIssueExecution } from '../../application/issues/release-issue-execution.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';

const TERMINAL_EVENT_TYPES = new Set(['run.completed', 'run.failed', 'run.cancelled', 'done']);

export interface ObserveRunTerminalDeps {
  orgId: string;
  issueExecutions?: IssueExecutionPort;
  events?: IssueEventsPort;
  worktrees?: RepositoryWorktreePort;
  logger?: Logger;
}

export function observeRunTerminal(
  deps: ObserveRunTerminalDeps,
  runId: string,
  events: SessionEvent[],
): void {
  if (!deps.issueExecutions && !deps.worktrees) {
    return;
  }
  if (!events.some((event) => TERMINAL_EVENT_TYPES.has(event.type))) {
    return;
  }
  const at = new Date().toISOString();
  try {
    releaseIssueExecution(deps, runId, at);
  } catch (error) {
    deps.logger?.warn('terminal release of issue execution failed', {
      orgId: deps.orgId,
      runId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
