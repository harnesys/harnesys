import { GitBranchIcon, PinIcon, PinOffIcon, Trash2Icon } from 'lucide-react';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { useThreadWaiting } from '@/features/desk';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { useSidebar } from '@/shared/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
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
  const { state, isMobile } = useSidebar();
  const timeZone = useOrgTimeZone();
  const iconMode = state === 'collapsed' && !isMobile;
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
    <div
      className={cn(
        'group/thread relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
        'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
      )}
      data-testid={`agent-thread-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
      data-branch={isBranch ? 'true' : 'false'}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
              onClick={onSelect}
            />
          }
        >
          <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-muted-foreground group-data-[collapsible=icon]:mt-0">
            <ThreadKindIcon kind={thread.kind} className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <span className="flex min-w-0 items-center gap-1">
              {isBranch ? (
                <GitBranchIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
              {thread.pinned ? (
                <PinIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              ) : null}
              <span className="block truncate pr-4 text-sm leading-4">{thread.title}</span>
            </span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
                {formatDayTime(thread.updatedAt, timeZone)}
              </span>
              {parts.length > 0 ? (
                <span className={cn('shrink-0 font-mono text-[8px]', statusTone)}>
                  {parts.join(' · ')}
                </span>
              ) : null}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" hidden={!iconMode}>
          {thread.lastError ? `${thread.title} — ${thread.lastError.message}` : thread.title}
        </TooltipContent>
      </Tooltip>
      {hasMenu ? (
        <ThreadRowActions thread={thread} onPinToggle={onPinToggle} onDelete={onDelete} />
      ) : null}
    </div>
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
    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 transition-opacity group-hover/thread:opacity-100 group-data-[collapsible=icon]:hidden">
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
    </div>
  );
}
