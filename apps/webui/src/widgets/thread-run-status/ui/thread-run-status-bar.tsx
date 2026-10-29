import type { ThreadActiveRun } from '@harnesys/studio-shared';
import {
  AlertCircleIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useSessionStore, useThreadFeed } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { retryRun } from '@/features/send-message';
import { cancelRun, nudgeIssueRecord } from '@/shared/api';
import { useOrgId } from '@/shared/config/location';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RunAttributionBadge } from '@/shared/ui/run-attribution-badge';
import { toast } from '@/shared/ui/toast';
import { RetryBanner, useRetrySignal } from './retry-banner';

export interface ThreadRunStatusBarProps {
  threadId: string;
  issueId?: string | null;
}

type BusyAction = 'stop' | 'restart' | 'retry' | null;

interface BarState {
  mode: 'running' | 'failed' | 'idle' | 'empty';
  runId: string | null;
  waiting: boolean;
  failureText: string | null;
  lastLabel: string | null;
  showRetry: boolean;
  attribution: ThreadActiveRun | null;
}

function useBarState(threadId: string): BarState {
  const liveRunId = useSessionStore((state) => state.activeRuns[threadId]?.runId ?? null);
  const thread = useThreadStore((state) => state.byId(threadId));
  const feed = useThreadFeed(threadId);
  const serverRun = thread?.activeRun ?? null;
  const lastError = thread?.lastError ?? null;
  const runs = feed?.runs ?? [];
  const lastRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
  const lastFeedError = lastRun?.error ?? null;
  const runId = liveRunId || serverRun?.runId || null;
  if (runId) {
    return {
      mode: 'running',
      runId,
      waiting: !liveRunId && (serverRun?.status === 'waiting' || serverRun?.status === 'queued'),
      failureText: null,
      lastLabel: null,
      showRetry: false,
      attribution: serverRun,
    };
  }
  const failureText = lastFeedError ?? lastError?.message ?? null;
  if (failureText) {
    return {
      mode: 'failed',
      runId: lastFeedError ? (lastRun?.runId ?? null) : (lastError?.runId ?? null),
      waiting: false,
      failureText,
      lastLabel: null,
      showRetry: true,
      attribution: null,
    };
  }
  if (lastRun) {
    return {
      mode: 'idle',
      runId: lastRun.runId ?? null,
      waiting: false,
      failureText: null,
      lastLabel: lastRunLabel(lastRun.terminal ?? 'done'),
      showRetry: false,
      attribution: null,
    };
  }
  return {
    mode: 'empty',
    runId: null,
    waiting: false,
    failureText: null,
    lastLabel: null,
    showRetry: false,
    attribution: null,
  };
}

function lastRunLabel(terminal: string): string {
  if (terminal === 'run.cancelled') {
    return 'Last run cancelled';
  }
  if (terminal === 'run.failed' || terminal === 'error') {
    return 'Last run failed';
  }
  return 'Last run completed';
}

function runningLabel(showRetry: boolean, waiting: boolean): string {
  if (showRetry) {
    return 'Waiting to retry the model call';
  }
  if (waiting) {
    return 'Run is waiting for placement';
  }
  return 'Agent is working';
}
function retryLabel(busy: BusyAction, issueId?: string | null): string {
  if (busy === 'retry') {
    return 'Retrying…';
  }
  if (issueId) {
    return 'Re-run task';
  }
  return 'Retry';
}
function rerunLabel(issueId?: string | null): string {
  if (issueId) {
    return 'Run again';
  }
  return 'Re-run';
}
export function ThreadRunStatusBar({ threadId, issueId }: ThreadRunStatusBarProps) {
  const retry = useRetrySignal(threadId);
  const bar = useBarState(threadId);
  const orgId = useOrgId();
  const [busy, setBusy] = useState<BusyAction>(null);
  const actions = { threadId, orgId, issueId, setBusy, busy };
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-3" data-testid="thread-run-status-bar">
      {retry && bar.mode === 'running' ? <RetryBanner threadId={threadId} /> : null}
      {bar.mode === 'running' && bar.runId ? (
        <RunningBar
          runId={bar.runId}
          waiting={bar.waiting}
          showRetry={Boolean(retry)}
          attribution={bar.attribution}
          {...actions}
        />
      ) : null}
      {bar.mode === 'failed' && bar.failureText ? (
        <FailedBar text={bar.failureText} runId={bar.runId} {...actions} />
      ) : null}
      {bar.mode === 'idle' ? (
        <IdleBar label={bar.lastLabel ?? 'Last run'} runId={bar.runId} {...actions} />
      ) : null}
      {bar.mode === 'empty' ? <EmptyBar {...actions} /> : null}
    </div>
  );
}

interface BarActions {
  threadId: string;
  orgId: string | null;
  issueId?: string | null;
  busy: BusyAction;
  setBusy: (value: BusyAction) => void;
}

function BarShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background px-3 py-1.5">
      {children}
    </div>
  );
}

function RunningBar({
  runId,
  waiting,
  showRetry,
  attribution,
  ...actions
}: BarActions & {
  runId: string;
  waiting: boolean;
  showRetry: boolean;
  attribution: ThreadActiveRun | null;
}) {
  const { threadId, issueId, orgId, busy, setBusy } = actions;
  return (
    <BarShell>
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
        <span className="truncate">{runningLabel(showRetry, waiting)}</span>
        <RunAttributionBadge run={attribution} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="xs"
          disabled={busy !== null}
          onClick={() => void stop(threadId, runId, setBusy)}
          data-testid="thread-run-stop"
        >
          <SquareIcon className="size-3 fill-current" />
          Stop
        </Button>
        <Button
          variant="outline"
          size="xs"
          disabled={busy !== null}
          onClick={() => void restart({ threadId, orgId, issueId, runId, setBusy })}
          data-testid="thread-run-restart"
        >
          <RotateCcwIcon />
          Restart
        </Button>
      </div>
    </BarShell>
  );
}

function FailedBar({
  text,
  runId,
  ...actions
}: BarActions & { text: string; runId: string | null }) {
  const { threadId, issueId, orgId, busy, setBusy } = actions;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-xs">
        <AlertCircleIcon className="size-3 shrink-0 text-destructive" />
        <span className="truncate font-mono text-destructive" title={text}>
          {text}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={busy !== null}
          onClick={() => void relaunch({ threadId, orgId, issueId, runId, setBusy })}
          data-testid="thread-run-retry"
        >
          <RotateCcwIcon />
          {retryLabel(busy, issueId)}
        </Button>
      </div>
    </div>
  );
}

function IdleBar({
  label,
  runId,
  ...actions
}: BarActions & { label: string; runId: string | null }) {
  const { threadId, issueId, orgId, busy, setBusy } = actions;
  return (
    <BarShell>
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        <CircleCheckIcon className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={busy !== null}
          onClick={() => void relaunch({ threadId, orgId, issueId, runId, setBusy })}
          data-testid="thread-run-rerun"
        >
          <RotateCcwIcon />
          {rerunLabel(issueId)}
        </Button>
      </div>
    </BarShell>
  );
}

function EmptyBar(actions: BarActions) {
  const { threadId, issueId, orgId, busy, setBusy } = actions;
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border border-border/40',
        'bg-background px-3 py-1.5',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs">
        <CircleCheckIcon className="size-3 shrink-0" />
        <span className="truncate">No runs yet</span>
      </div>
      {issueId ? (
        <Button
          variant="outline"
          size="xs"
          disabled={busy !== null}
          onClick={() => void relaunch({ threadId, orgId, issueId, runId: null, setBusy })}
          data-testid="thread-run-start"
        >
          <PlayIcon />
          Run task
        </Button>
      ) : null}
    </div>
  );
}

async function stop(
  threadId: string,
  runId: string,
  setBusy: (value: BusyAction) => void,
): Promise<void> {
  setBusy('stop');
  try {
    await cancelRun(threadId, runId);
  } catch (error) {
    toast.add({ title: 'Stop failed', description: errorMessage(error), type: 'error' });
  } finally {
    setBusy(null);
  }
}

interface RestartInput {
  threadId: string;
  orgId: string | null;
  issueId?: string | null;
  runId: string;
  setBusy: (value: BusyAction) => void;
}

async function restart(input: RestartInput): Promise<void> {
  const { threadId, orgId, issueId, runId, setBusy } = input;
  setBusy('restart');
  try {
    await cancelRun(threadId, runId).catch(() => undefined);
    if (issueId) {
      if (!orgId) {
        throw new Error('organization is not selected');
      }
      const issue = await nudgeIssueRecord(orgId, issueId);
      useThreadStore.getState().setLastError(threadId, null);
      toast.add({ title: 'Task re-fired', description: issue.title, type: 'success' });
    } else {
      await retryRun(threadId, runId);
      useThreadStore.getState().setLastError(threadId, null);
    }
  } catch (error) {
    toast.add({ title: 'Restart failed', description: errorMessage(error), type: 'error' });
  } finally {
    setBusy(null);
  }
}

interface RelaunchInput {
  threadId: string;
  orgId: string | null;
  issueId?: string | null;
  runId?: string | null;
  setBusy: (value: BusyAction) => void;
}

async function relaunch(input: RelaunchInput): Promise<void> {
  const { threadId, orgId, issueId, runId, setBusy } = input;
  setBusy('retry');
  try {
    if (issueId) {
      if (!orgId) {
        throw new Error('organization is not selected');
      }
      const issue = await nudgeIssueRecord(orgId, issueId);
      useThreadStore.getState().setLastError(threadId, null);
      toast.add({ title: 'Task re-fired', description: issue.title, type: 'success' });
      return;
    }
    if (!runId || runId.startsWith('launch:')) {
      throw new Error('nothing to retry yet — start a new run');
    }
    await retryRun(threadId, runId);
    useThreadStore.getState().setLastError(threadId, null);
  } catch (error) {
    toast.add({ title: 'Retry failed', description: errorMessage(error), type: 'error' });
  } finally {
    setBusy(null);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}
