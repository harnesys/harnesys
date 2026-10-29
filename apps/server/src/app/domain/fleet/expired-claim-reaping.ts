import type { RunLifecycleStatus } from 'harnesys';

export const WORKER_LEASE_EXPIRED_MESSAGE = 'worker lease expired; history is preserved';

export function isWorkerOwnedRunStatus(
  status: string,
): status is Extract<RunLifecycleStatus, 'running'> {
  return status === 'running';
}
