import type { SessionEvent } from '@harnesys/studio-shared';
import { useThreadStore } from '@/entities/thread';
import { useMyColor, useUserColor } from '@/shared/api/members';
import { UserAvatar } from '@/shared/ui/user-avatar';

export function AuthorLabel({ event, threadId }: { event: SessionEvent; threadId?: string }) {
  const group = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.kind === 'group' : false,
  );
  const authorUserId = event.author?.provider === 'app' ? event.author.providerUserId : null;
  const authorColor = useUserColor(authorUserId);
  const myColor = useMyColor();
  const color = event.author ? authorColor : myColor;
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
      <UserAvatar
        name={name}
        seed={event.author?.providerUserId ?? 'you'}
        color={color}
        title={name}
        size="sm"
      />
    </div>
  );
}
