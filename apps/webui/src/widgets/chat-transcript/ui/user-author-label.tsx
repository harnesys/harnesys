import type { SessionEvent } from '@harnesys/studio-shared';
import { useThreadStore } from '@/entities/thread';
import { UserAvatar } from '@/shared/ui/user-avatar';

export function AuthorLabel({ event, threadId }: { event: SessionEvent; threadId?: string }) {
  const group = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.kind === 'group' : false,
  );
  const name = event.author?.displayName ?? 'You';
  if (!group) {
    if (!event.author) {
      return null;
    }
    return <div className="text-[11px] text-muted-foreground">{event.author.displayName}</div>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-medium text-muted-foreground text-xs">{name}</span>
      <UserAvatar name={name} seed={event.author?.providerUserId ?? 'you'} title={name} size="sm" />
    </div>
  );
}
