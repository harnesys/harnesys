import { GitBranchIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useThreadWaiting } from '@/features/desk';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { SidebarRow, SidebarRowMeta, SidebarRowTitle } from '@/shared/ui/sidebar-row';
import { ThreadKindIcon } from './thread-kind-icon';

export function AgentThreadRow({
  thread,
  selected,
  onSelect,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  selected: boolean;
  onSelect: () => void;
  onPinToggle?: () => void;
  onDelete?: () => void;
}) {
  const timeZone = useOrgTimeZone();
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting =
    useThreadWaiting(thread.id) ||
    thread.activeRun?.status === 'waiting' ||
    thread.activeRun?.status === 'needs_input';
  let runState: 'running' | 'waiting' | null = null;
  if (running) {
    runState = 'running';
  } else if (waiting) {
    runState = 'waiting';
  }
  const parts: string[] = [];
  if (runState) {
    parts.push(runState);
  }
  if (thread.lastError) {
    parts.push('error');
  } else if (thread.unread) {
    parts.push('unread');
  }
  let statusTone = 'text-live';
  if (thread.lastError) {
    statusTone = 'text-destructive';
  } else if (runState === 'waiting') {
    statusTone = 'text-live/70';
  }
  const isBranch = Boolean(thread.parentThreadId);
  const hasMenu = Boolean(onPinToggle || onDelete);
  return (
    <SidebarRow
      variant="card"
      testId={`agent-thread-${thread.id}`}
      selected={selected}
      data-branch={isBranch ? 'true' : 'false'}
      leading={
        <ThreadKindIcon
          kind={thread.kind}
          className="text-muted-foreground"
          icon={thread.icon}
          color={thread.color}
        />
      }
      actions={
        hasMenu ? (
          <ThreadRowActions thread={thread} onPinToggle={onPinToggle} onDelete={onDelete} />
        ) : null
      }
      onClick={onSelect}
    >
      <span className="flex min-w-0 items-center gap-1">
        {isBranch ? (
          <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        {thread.pinned ? (
          <PinIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        <SidebarRowTitle>{thread.title}</SidebarRowTitle>
      </span>
      <span className="mt-0.5 flex items-baseline justify-between gap-2">
        <SidebarRowMeta className="font-mono">
          {formatDayTime(thread.updatedAt, timeZone)}
        </SidebarRowMeta>
        {parts.length > 0 ? (
          <span className={cn('shrink-0 font-mono text-[10px]', statusTone)}>
            {parts.join(' · ')}
          </span>
        ) : null}
      </span>
    </SidebarRow>
  );
}

function ThreadRowActions({
  thread,
  onPinToggle,
  onDelete,
}: {
  thread: Thread;
  onPinToggle?: () => void;
  onDelete?: () => void;
}) {
  return (
    <>
      {onPinToggle ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={thread.pinned ? 'Unpin thread' : 'Pin thread'}
          onClick={(event) => {
            event.stopPropagation();
            onPinToggle();
          }}
        >
          {thread.pinned ? (
            <PinOffIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          ) : (
            <PinIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
          )}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Delete thread"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2Icon className="text-sidebar-foreground/50 group-hover/button:text-destructive" />
        </Button>
      ) : null}
    </>
  );
}
