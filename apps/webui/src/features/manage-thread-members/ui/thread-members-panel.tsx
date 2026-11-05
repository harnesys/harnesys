import { UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Thread } from '@/entities/thread';
import { cn } from '@/shared/lib/utils';
import { AddThreadMemberMenu } from './add-thread-member-menu';
import { ThreadGroupSettings } from './thread-group-settings';
import { ThreadMembersPopover } from './thread-member-avatars';

function memberSummary(agents: number, people: number): string {
  const parts: string[] = [];
  if (agents > 0) {
    parts.push(`${agents} ${agents === 1 ? 'agent' : 'agents'}`);
  }
  if (people > 0) {
    parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No members yet';
}

export function ThreadMembersPanel({ thread, telegram }: { thread: Thread; telegram?: ReactNode }) {
  const members = thread.members ?? [];
  const participants = thread.participants ?? [];

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-border/40 border-b px-3 py-2"
      data-testid="thread-members-panel"
    >
      <div className="flex min-w-0 flex-1 items-center">
        <div
          className={cn(
            'mr-2 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted-foreground/10 text-muted-foreground',
          )}
        >
          <UsersIcon className="size-4" />
        </div>
        <div>
          <div className="truncate font-medium text-sm leading-5">
            {thread.title || 'Group thread'}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UsersIcon className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{memberSummary(members.length, participants.length)}</span>
          </div>
        </div>
      </div>
      {telegram ?? null}
      <ThreadMembersPopover thread={thread} />
      <AddThreadMemberMenu thread={thread} />
      <ThreadGroupSettings thread={thread} />
    </header>
  );
}
