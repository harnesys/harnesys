import type { RunLifecycleStore } from 'harnesys';
import type { IssueExecutionPort } from '../../domain/issue/issue-execution.port.ts';
import { reconcileIssueExecution } from '../../domain/issue/issue-execution.ts';

export interface RecoverIssueExecutionsDeps {
  orgId: string;
  executions: IssueExecutionPort;
  lifecycle: RunLifecycleStore;
}

export async function recoverIssueExecutionsIfPresent(input: {
  orgId: string;
  executions: IssueExecutionPort | undefined;
  lifecycle: RunLifecycleStore;
}): Promise<number> {
  if (!input.executions) {
    return 0;
  }
  return recoverIssueExecutions({
    orgId: input.orgId,
    executions: input.executions,
    lifecycle: input.lifecycle,
  });
}

export async function recoverIssueExecutions(deps: RecoverIssueExecutionsDeps): Promise<number> {
  const active = deps.executions.listActive(deps.orgId);
  const now = new Date().toISOString();
  let released = 0;
  for (const execution of active) {
    let runStatus: string | null = null;
    if (execution.runId) {
      const rec = await deps.lifecycle.get(execution.runId).catch(() => null);
      runStatus = rec?.status ?? null;
    }
    const action = reconcileIssueExecution({
      execution,
      runStatus,
      startup: true,
    });
    if (action.kind !== 'release') {
      continue;
    }
    deps.executions.release(deps.orgId, execution.id, now);
    released += 1;
  }
  return released;
}
