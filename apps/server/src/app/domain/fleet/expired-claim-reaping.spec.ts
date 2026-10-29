import { describe, expect, test } from 'bun:test';
import { isWorkerOwnedRunStatus, WORKER_LEASE_EXPIRED_MESSAGE } from './expired-claim-reaping.ts';

describe('isWorkerOwnedRunStatus', () => {
  test('running is worker-owned', () => {
    expect(isWorkerOwnedRunStatus('running')).toBe(true);
  });

  test('non-terminal parked states are not worker-owned', () => {
    for (const status of ['queued', 'needs_input', 'waiting']) {
      expect(isWorkerOwnedRunStatus(status)).toBe(false);
    }
  });

  test('terminal states are not worker-owned', () => {
    for (const status of ['completed', 'failed', 'cancelled']) {
      expect(isWorkerOwnedRunStatus(status)).toBe(false);
    }
  });
});

describe('WORKER_LEASE_EXPIRED_MESSAGE', () => {
  test('explains the terminal transition without blaming history', () => {
    expect(WORKER_LEASE_EXPIRED_MESSAGE).toContain('history is preserved');
  });
});
