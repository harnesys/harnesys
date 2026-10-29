import { describe, expect, test } from 'bun:test';
import type { ApprovalBudget } from '@harnesys/contracts';
import type { ApprovalRecord } from '../../domain/approval/approval.ts';
import { extensionOf, resumePayloadOf } from './decide-approval.use-case.ts';

function spendRow(budget?: ApprovalBudget): ApprovalRecord {
  return {
    id: 'approval-1',
    runId: 'run-1',
    agentId: 'agent-1',
    threadId: 'thread-1',
    interruptId: 'budget/run-1/think/1',
    kind: 'spend',
    question: 'Step budget of 40 reached',
    options: ['approve', 'close', 'deny'],
    context: { source: 'budget', ...(budget === undefined ? {} : { budget }) },
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionSeq: 0,
    resumeState: 'pending',
    createdAt: new Date(0).toISOString(),
  };
}

const BUDGET = { kind: 'steps' as const, limit: 40, used: 40, defaultExtend: 10 };

describe('resumePayloadOf', () => {
  test('approve without an amount carries only the approval', () => {
    expect(resumePayloadOf('approve')).toEqual({ approved: true });
  });

  test('approve with an amount carries the extension', () => {
    expect(resumePayloadOf('approve', 25)).toEqual({ approved: true, extend: 25 });
  });

  test('close asks the run to finish with a report', () => {
    expect(resumePayloadOf('close')).toEqual({ approved: true, close: true });
  });
});

describe('extensionOf', () => {
  test('takes the amount from the request', () => {
    expect(extensionOf({ decision: 'approve', surface: 'web', extend: 5 }, spendRow(BUDGET))).toBe(
      5,
    );
  });

  test('falls back to the default from the approval context', () => {
    expect(extensionOf({ decision: 'approve', surface: 'web' }, spendRow(BUDGET))).toBe(10);
  });

  test('close extends nothing', () => {
    expect(extensionOf({ decision: 'close', surface: 'web' }, spendRow(BUDGET))).toBeUndefined();
  });

  test('a record without budget extends nothing', () => {
    expect(extensionOf({ decision: 'approve', surface: 'web' }, spendRow())).toBeUndefined();
  });
});
