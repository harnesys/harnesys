import { HashIcon, PlusIcon } from 'lucide-react';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { openCreateGroupThreadDialog } from '@/features/create-group-thread';
import { useThreadWaiting } from '@/features/desk';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { useStudioNavigation } from '@/shared/config/navigation';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { IconRef } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';
import { runStatus, threadTime } from '../model/row-status';
import { openThreadRecord } from '../model/thread-actions';

export function ChannelsSection({
  channels,
  activeThreadId,
  onSelectDone,
  loading = false,
}: {
  channels: Thread[];
  activeThreadId: string | null;
  onSelectDone: () => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-1 px-1">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }
  if (channels.length === 0) {
    return <p className="px-1.5 py-1 text-[11px] text-muted-foreground">No channels yet.</p>;
  }
  return (
    <div className="flex flex-col gap-0.5 pb-1" data-testid="channels-section">
      {channels.map((thread) => (
        <ChannelRow
          key={thread.id}
          thread={thread}
          selected={activeThreadId === thread.id}
          onSelectDone={onSelectDone}
        />
      ))}
    </div>
  );
}

export function ChannelsSectionActions() {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      title="New channel"
      aria-label="New channel"
      data-testid="group-create"
      onClick={() => void openCreateGroupThreadDialog()}
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New channel</span>
    </Button>
  );
}

function ChannelRow({
  thread,
  selected,
  onSelectDone,
}: {
  thread: Thread;
  selected: boolean;
  onSelectDone: () => void;
}) {
  const { openThread } = useStudioNavigation();
  const timeZone = useOrgTimeZone();
  const running = useSessionStore((s) => Boolean(s.activeRuns[thread.id]));
  const waiting = useThreadWaiting(thread.id);
  const status = runStatus(running, waiting);
  const open = () => {
    if (!thread.orgId) {
      return;
    }
    openThreadRecord(thread, thread.orgId);
    openThread(thread.orgId, thread.id);
    onSelectDone();
  };
  return (
    <div
      className={cn(
        'group/channel relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`channel-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
        onClick={open}
      >
        <span
          className={cn(
            'relative inline-flex size-6 shrink-0 items-center justify-center rounded-md',
            entityColorTintClass(thread.color ?? null),
          )}
          style={entityColorTintStyle(thread.color ?? null)}
        >
          {thread.icon ? (
            <IconRef icon={thread.icon} className="size-4" />
          ) : (
            <HashIcon className="size-4" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm leading-4', thread.unread && 'font-medium')}>
            {thread.title}
          </span>
          <span className="mt-0.5 flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground leading-4">
              {threadTime(thread.updatedAt, timeZone)}
            </span>
            {status || thread.unread ? (
              <span
                className={cn(
                  'shrink-0 font-mono text-[8px]',
                  status === 'waiting' ? 'text-live/70' : 'text-live',
                )}
              >
                {status ?? 'unread'}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  );
}
