import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from 'harnesys';
import { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import type { IssueExecution } from '../../domain/issue/issue-execution.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { observeRunTerminal } from './observe-run-terminal.ts';

function event(type: string): SessionEvent {
  return { type, runId: 'run-1', seq: 1 } as SessionEvent;
}

describe('observeRunTerminal', () => {
  function stubExecutions(released: string[]): IssueExecutionPort {
    const port: Pick<IssueExecutionPort, 'releaseByRunId'> = {
      releaseByRunId: (_orgId: string, runId: string): IssueExecution | null => {
        released.push(runId);
        return null;
      },
    };
    return port as IssueExecutionPort;
  }

  function stubWorktrees(cleared: string[]): RepositoryWorktreePort {
    const port: Pick<RepositoryWorktreePort, 'clearActiveRun'> = {
      clearActiveRun: (_orgId: string, runId: string): void => {
        cleared.push(runId);
      },
    };
    return port as RepositoryWorktreePort;
  }

  test('releases execution and worktree active-run on terminal event', () => {
    const released: string[] = [];
    const cleared: string[] = [];
    observeRunTerminal(
      {
        orgId: 'org-1',
        issueExecutions: stubExecutions(released),
        worktrees: stubWorktrees(cleared),
      },
      'run-1',
      [event('run.completed')],
    );
    expect(released).toEqual(['run-1']);
    expect(cleared).toEqual(['run-1']);
  });

  test('keeps reservation on non-terminal events', () => {
    const released: string[] = [];
    observeRunTerminal({ orgId: 'org-1', issueExecutions: stubExecutions(released) }, 'run-1', [
      event('tool'),
      event('text-delta'),
    ]);
    expect(released).toEqual([]);
  });

  test('release failure is logged, not thrown', () => {
    const warnings: unknown[][] = [];
    const failing = stubFailingExecutions();
    const logger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (message: string, extra: unknown) => warnings.push([message, extra]),
      error: () => undefined,
    };
    expect(() =>
      observeRunTerminal({ orgId: 'org-1', issueExecutions: failing, logger }, 'run-1', [
        event('run.completed'),
      ]),
    ).not.toThrow();
    expect(warnings).toHaveLength(1);
  });
});

function stubFailingExecutions(): IssueExecutionPort {
  const port: Pick<IssueExecutionPort, 'releaseByRunId'> = {
    releaseByRunId: () => {
      throw new Error('SQLITE_BUSY');
    },
  };
  return port as IssueExecutionPort;
}
