import type { SessionEvent } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { pendingHitl } from './pending-hitl';
import { type RunPhase, runPhaseOf } from './run-phase';

const EMPTY_EVENTS: SessionEvent[] = [];

export function useRunPhase(threadId: string | null): RunPhase {
  const clientRun = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const pendingAsk = useSessionStore((state) =>
    threadId ? pendingHitl(state.events[threadId] ?? EMPTY_EVENTS) !== null : false,
  );
  const serverRun = useThreadStore((state) =>
    threadId ? (state.byId(threadId)?.activeRun ?? null) : null,
  );
  return runPhaseOf({ clientRun, pendingAsk, serverRun });
}
