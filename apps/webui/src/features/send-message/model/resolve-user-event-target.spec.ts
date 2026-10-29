import { describe, expect, test } from 'bun:test';
import { resolveUserEventTarget } from './resolve-user-event-target.ts';

describe('resolveUserEventTarget', () => {
  test('passes through known run and seq', () => {
    expect(resolveUserEventTarget({ runId: 'run-1', seq: 3, activeRunId: 'run-2' })).toEqual({
      runId: 'run-1',
      seq: 3,
    });
  });

  test('pending message resolves to its run opening event', () => {
    expect(resolveUserEventTarget({ runId: 'run-1', activeRunId: 'run-1' })).toEqual({
      runId: 'run-1',
      seq: 1,
    });
  });

  test('falls back to the active run when the message carries no run', () => {
    expect(resolveUserEventTarget({ activeRunId: 'run-9' })).toEqual({ runId: 'run-9', seq: 1 });
  });

  test('treats empty run ids as missing', () => {
    expect(resolveUserEventTarget({ runId: '', seq: 2, activeRunId: 'run-9' })).toEqual({
      runId: 'run-9',
      seq: 1,
    });
    expect(resolveUserEventTarget({ runId: '', activeRunId: '' })).toBeUndefined();
  });

  test('returns undefined when nothing addresses the server', () => {
    expect(resolveUserEventTarget({})).toBeUndefined();
  });
});
