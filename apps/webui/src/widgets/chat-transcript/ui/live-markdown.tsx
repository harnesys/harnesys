import { useLiveTail } from '@/entities/session';
import { liveBlockText } from '../model/live-text';
import { ThreadMarkdown } from '../model/thread-markdown';

export function LiveMarkdown({
  text,
  live,
  threadId,
  blockId,
}: {
  text: string;
  live: boolean;
  threadId?: string;
  blockId?: string;
}) {
  const tail = useLiveTail(live ? threadId : undefined);
  const applies =
    live &&
    tail.kind === 'text' &&
    tail.text !== '' &&
    (blockId === undefined || tail.id === blockId);
  const shown = liveBlockText(text, applies ? tail : null);
  return <ThreadMarkdown text={shown} threadId={threadId} streaming={live} />;
}
