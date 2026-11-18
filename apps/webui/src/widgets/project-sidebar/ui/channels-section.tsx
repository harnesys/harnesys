import { PlusIcon } from 'lucide-react';
import { useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { openCreateGroupThreadDialog } from '@/features/create-group-thread';
import { useThreadWaiting } from '@/features/desk';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { useStudioNavigation } from '@/shared/config/navigation';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ChannelIcon } from '@/shared/ui/icon';
import { Skeleton } from '@/shared/ui/skeleton';
import { rowRight, runStatus, threadTime } from '../model/row-status';
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
        'group/channel relative flex items-center rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`channel-${thread.id}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md pr-2 pl-3 text-left"
        onClick={open}
      >
        <span className="inline-flex size-3 shrink-0 items-center justify-center">
          <ChannelIcon icon={thread.icon} color={thread.color} className="size-3" />
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-xs leading-none',
            thread.unread && 'font-medium',
          )}
        >
          {thread.title}
        </span>
        {rowRight(status, thread.unread, threadTime(thread.updatedAt, timeZone), 'channel')}
      </button>
    </div>
  );
}
