import type { SessionEvent } from '@harnesys/studio-shared';
import { useQuery } from '@tanstack/react-query';
import { useThreadStore } from '@/entities/thread';
import { currentUserQuery } from '@/shared/api/sessions';

export type MessageSide = 'start' | 'end';

export function useUserMessageSide(event: SessionEvent, threadId?: string): MessageSide {
  const group = useThreadStore((state) =>
    threadId ? state.byId(threadId)?.kind === 'group' : false,
  );
  const currentUserId = useQuery(currentUserQuery()).data?.userId;
  const authorId = event.author?.providerUserId;
  const mine = !authorId || !currentUserId || authorId === currentUserId;
  return group && !mine ? 'start' : 'end';
}
