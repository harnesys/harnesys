import type { TerminalSessionOrigin } from '@harnesys/studio-shared';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';

export type TerminalConnectionStatus = 'connecting' | 'live' | 'exited' | 'error';

const STATUS_DOT: Record<TerminalConnectionStatus, string> = {
  connecting: 'bg-status-warn',
  live: 'bg-status-ok',
  exited: 'bg-muted-foreground/50',
  error: 'bg-red-500',
};

const STATUS_LABEL: Record<TerminalConnectionStatus, string> = {
  connecting: 'Connecting...',
  live: 'Live',
  exited: 'Exited',
  error: 'Error',
};

const SEGMENT = 'flex shrink-0 items-center gap-1 px-1';

export function TerminalStatusBar({
  title,
  origin,
  cwd,
  status,
  exitCode,
  readOnly,
  cols,
  rows,
  createdAt,
}: {
  title: string;
  origin: TerminalSessionOrigin;
  cwd: string;
  status: TerminalConnectionStatus;
  exitCode: number | null;
  readOnly: boolean;
  cols: number;
  rows: number;
  createdAt: string;
}) {
  const [copied, setCopied] = useState(false);
  const uptime = useUptime(createdAt, status === 'exited' || status === 'error');
  const statusLabel =
    status === 'exited' && exitCode !== null
      ? `${STATUS_LABEL.exited} (${exitCode})`
      : STATUS_LABEL[status];
  const copyCwd = async () => {
    try {
      await navigator.clipboard.writeText(cwd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <footer
      className="flex h-6 shrink-0 select-none items-center gap-1 border-border/60 border-t bg-muted/30 px-2 text-[11px] text-muted-foreground"
      data-testid="terminal-status-bar"
    >
      <span
        title={origin === 'agent' ? 'Opened by an agent' : 'Opened by you'}
        data-testid="terminal-status-origin"
        className="shrink-0 rounded bg-muted px-1 py-px text-[9px] uppercase tracking-wide"
      >
        {origin}
      </span>
      <span title={title} className="max-w-48 shrink-0 truncate px-1 text-foreground/80">
        {title}
      </span>
      <button
        type="button"
        onClick={copyCwd}
        title={cwd ? `${cwd} — click to copy` : 'Working directory unavailable'}
        data-testid="terminal-status-cwd"
        className="group/cwd flex min-w-0 flex-1 items-center gap-1 truncate px-1 hover:text-foreground"
      >
        <span className="truncate">{cwd || '—'}</span>
        {copied ? (
          <CheckIcon className="size-3 shrink-0 text-status-ok" />
        ) : (
          <CopyIcon className="size-3 shrink-0 opacity-0 group-hover/cwd:opacity-70" />
        )}
      </button>
      <span className="ml-auto flex shrink-0 items-center">
        <span
          title={readOnly ? 'Read-only access' : 'Read and write access'}
          data-testid="terminal-status-access"
          className={cn(SEGMENT, readOnly && 'text-status-warn')}
        >
          {readOnly ? 'Read-only' : 'R/W'}
        </span>
        <span title="Terminal size (columns x rows)" className="px-1 tabular-nums">
          {cols}x{rows}
        </span>
        <span
          title="Session uptime"
          data-testid="terminal-status-uptime"
          className="px-1 tabular-nums"
        >
          {uptime}
        </span>
        <span
          title="Connection status"
          data-testid="terminal-status-connection"
          className={SEGMENT}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
          {statusLabel}
        </span>
      </span>
    </footer>
  );
}

function useUptime(createdAt: string, frozen: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (frozen) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [frozen]);
  const start = Date.parse(createdAt);
  if (Number.isNaN(start)) {
    return '—';
  }
  return formatDuration(Math.max(0, now - start));
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}
