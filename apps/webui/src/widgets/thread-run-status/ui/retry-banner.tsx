import type { SessionEvent } from '@harnesys/studio-shared';
import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatClock, formatDayTime } from '@/shared/lib/format-clock';

const TICK_MS = 500;
const COUNTDOWN_MAX_S = 90;
const DAY_MS = 86_400_000;

export function useRetrySignal(threadId: string | null): RetrySignal | null {
  const runId = useSessionStore((state) =>
    threadId ? (state.activeRuns[threadId]?.runId ?? null) : null,
  );
  return useSessionStore((state) =>
    lastRetry(threadId ? state.events[threadId] : undefined, runId),
  );
}

export function RetryBanner({ threadId }: { threadId: string }) {
  const retry = useRetrySignal(threadId);
  const timeZone = useOrgTimeZone();
  const [deadline, setDeadline] = useState<number | null>(null);
  const retryKey = retry ? `${retry.runId}:${retry.seq ?? retry.attempt}` : null;
  useEffect(() => {
    setDeadline(retry && retryKey ? retryDeadline(retry) : null);
  }, [retry, retryKey]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const timer = setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [deadline]);
  if (!retry || deadline === null) {
    return null;
  }
  const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  return (
    <div
      className="mb-1.5 flex items-start gap-2 rounded-lg border border-status-warn/25 bg-status-warn/5 px-3 py-2"
      data-testid="retry-banner"
    >
      <RefreshCwIcon className="mt-0.5 size-3.5 shrink-0 animate-spin text-status-warn" />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] text-status-warn">
          Retrying attempt {retry.attempt}/{retry.maxRetries} ·{' '}
          {retryScheduleLabel(deadline, remaining, timeZone)}
        </div>
        <div className="break-words text-muted-foreground text-xs" title={retry.message}>
          {retry.message}
        </div>
      </div>
    </div>
  );
}

export interface RetrySignal {
  runId?: string;
  seq?: number;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  resumeAt?: number;
  message: string;
}

function retryDeadline(retry: RetrySignal): number {
  return retry.resumeAt ?? Date.now() + retry.delayMs;
}

function retryScheduleLabel(deadline: number, remainingSeconds: number, timeZone: string): string {
  if (remainingSeconds <= COUNTDOWN_MAX_S) {
    return `next in ${remainingSeconds}s`;
  }
  if (deadline - Date.now() > DAY_MS) {
    return `resumes ${formatDayTime(deadline, timeZone)}`;
  }
  return `resumes at ${formatClock(deadline, timeZone)}`;
}

function lastRetry(events: SessionEvent[] | undefined, runId: string | null): RetrySignal | null {
  if (!events || !runId) {
    return null;
  }
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (!event || event.runId !== runId) {
      continue;
    }
    return event.type === 'model.retry' ? event : null;
  }
  return null;
}
