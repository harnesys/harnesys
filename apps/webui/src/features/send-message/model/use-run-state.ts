import { useSessionStore } from '@/entities/session';

export function useRunState(threadId: string | null): string | null {
  const run = useSessionStore((state) =>
    threadId ? (state.activeRuns[threadId]?.runId ?? null) : null,
  );
  const hasAsk = useSessionStore((state) => {
    if (!threadId) {
      return false;
    }
    return (state.events[threadId] ?? []).some((event) => event.type === 'ask');
  });
  if (!run) {
    return null;
  }
  return hasAsk ? 'paused' : 'live';
}
