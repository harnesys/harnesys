import type { Logger, SessionEvent } from 'harnesys';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';

const TERMINAL_EVENT_TYPES = new Set(['run.completed', 'run.failed', 'run.cancelled', 'done']);

export interface ObserveRunTerminalDeps {
  orgId: string;
  issueExecutions?: IssueExecutionPort;
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
    deps.issueExecutions?.releaseByRunId(deps.orgId, runId, at);
    deps.worktrees?.clearActiveRun(deps.orgId, runId, at);
  } catch (error) {
    deps.logger?.warn('terminal release of issue execution failed', {
      orgId: deps.orgId,
      runId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
