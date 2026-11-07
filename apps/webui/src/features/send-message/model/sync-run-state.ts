import type { ThreadActiveRun } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'dead_lettered']);

export function syncRunStateFromThread(threadId: string, activeRun: ThreadActiveRun | null): void {
  const session = useSessionStore.getState();
  const tracked = session.activeRuns[threadId];

  if (activeRun !== null && !TERMINAL_STATUSES.has(activeRun.status)) {
    if (!tracked || tracked.runId !== activeRun.runId) {
      session.startRun(threadId, new AbortController(), activeRun.runId);
    }
    return;
  }

  if (!tracked) {
    return;
  }

  if (tracked.runId && activeRun !== null && activeRun.runId !== tracked.runId) {
    return;
  }
  session.finishRun(threadId, activeRun?.runId);
}
