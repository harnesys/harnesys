import { describe, expect, test } from 'bun:test';
import {
  decideIssueReservation,
  explainIssueHandoffBlock,
  type IssueExecution,
  issueExecutionCorrelationId,
  issueHandoffBlockers,
  reconcileIssueExecution,
} from './issue-execution.ts';

function execution(
  partial: Partial<IssueExecution> & Pick<IssueExecution, 'correlationId'>,
): IssueExecution {
  return {
    id: 'exec-1',
    orgId: 'org-1',
    issueId: 'issue-1',
    runId: null,
    agentId: 'agent-1',
    worktreeId: null,
    leaseEpoch: 1,
    state: 'reserved',
    requestedStatus: 'in_progress',
    ruleId: null,
    profileId: null,
    createdAt: 't0',
    updatedAt: 't0',
    ...partial,
  };
}

describe('issue-execution helpers', () => {
  test('correlation id is stable', () => {
    expect(issueExecutionCorrelationId('iss-1', 'in_progress', 'ag-1')).toBe(
      'issue:iss-1:in_progress:ag-1',
    );
  });

  test('reservation is idempotent for same correlation and conflicts otherwise', () => {
    const existing = execution({
      correlationId: 'issue:iss-1:in_progress:ag-1',
      state: 'active',
      runId: 'run-1',
    });
    expect(
      decideIssueReservation({
        existing,
        correlationId: 'issue:iss-1:in_progress:ag-1',
        handoffObservation: null,
        checkHandoff: false,
      }),
    ).toEqual({ kind: 'idempotent', execution: existing });
    expect(
      decideIssueReservation({
        existing,
        correlationId: 'issue:iss-1:in_review:ag-2',
        handoffObservation: null,
        checkHandoff: false,
      }).kind,
    ).toBe('conflict');
  });

  test('blocks dirty/unpushed handoff and releases terminal runs', () => {
    const blockers = issueHandoffBlockers({
      hasActiveExecution: false,
      dirty: true,
      unpushed: true,
    });
    expect(explainIssueHandoffBlock(blockers)).toContain('uncommitted changes');
    expect(
      decideIssueReservation({
        existing: null,
        correlationId: 'issue:iss-1:in_review:ag-2',
        handoffObservation: { dirty: false, unpushed: true },
        checkHandoff: true,
      }).kind,
    ).toBe('handoff-blocked');
    expect(
      reconcileIssueExecution({
        execution: execution({
          correlationId: 'c',
          state: 'active',
          runId: 'run-1',
        }),
        runStatus: 'completed',
      }),
    ).toEqual({ kind: 'release', reason: 'terminal-run' });
  });
});
