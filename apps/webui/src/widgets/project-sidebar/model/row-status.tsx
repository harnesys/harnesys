import type { ReactNode } from 'react';
import { formatClock, formatShortDate } from '@/shared/lib/format-clock';
import { dayKeyInTimeZone } from '@/shared/lib/time-zone';
import { cn } from '@/shared/lib/utils';

export type RowRunStatus = 'running' | 'waiting' | null;

export function runStatus(running: boolean, waiting: boolean): RowRunStatus {
  if (running) {
    return 'running';
  }
  if (waiting) {
    return 'waiting';
  }
  return null;
}

export function threadTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  if (dayKeyInTimeZone(timeZone, date) === dayKeyInTimeZone(timeZone, new Date())) {
    return formatClock(iso, timeZone);
  }
  return formatShortDate(iso, timeZone);
}

export function rowRight(status: RowRunStatus, unread: boolean, time: string): ReactNode {
  if (status) {
    return (
      <span
        title={status}
        className={cn(
          'relative inline-flex size-1.5 shrink-0 rounded-full',
          status === 'running' && 'animate-pulse',
          status === 'running' ? 'bg-live' : 'bg-live/60',
        )}
      >
        <span className="sr-only">{status}</span>
      </span>
    );
  }
  if (unread) {
    return (
      <span title="unread" className="relative inline-flex size-1.5 shrink-0 rounded-full bg-live">
        <span className="sr-only">unread</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        'shrink-0 font-mono text-[11px] text-muted-foreground/70 leading-4',
        'group-hover/row:hidden',
      )}
    >
      {time}
    </span>
  );
}
