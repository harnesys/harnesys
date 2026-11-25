import { AnchorIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ThreadMarkdown } from '../model/thread-markdown';
import type { MessageSide } from '../model/use-user-message-side';

const BUBBLE_TAIL: Record<MessageSide, string> = {
  start: 'rounded-bl-md',
  end: 'rounded-br-md',
};

export function UserMessageBubble({
  text,
  threadId,
  side,
  anchored,
}: {
  text: string;
  threadId?: string;
  side: MessageSide;
  anchored: boolean;
}) {
  return (
    <div
      className={cn(
        'relative max-w-[80%] rounded-2xl bg-secondary px-3.5 py-1.5 text-secondary-foreground shadow-xs',
        BUBBLE_TAIL[side],
        anchored && 'ring-1 ring-live/60',
      )}
    >
      <ThreadMarkdown text={text} threadId={threadId} />
      {anchored ? (
        <span
          role="img"
          className="absolute -top-2.5 -right-2 inline-flex size-5 items-center justify-center rounded-full bg-live text-background shadow-sm"
          title="History starts here"
          aria-label="History anchor"
        >
          <AnchorIcon className="size-3" />
        </span>
      ) : null}
    </div>
  );
}
