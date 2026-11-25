import { ReplyPreview, useReplyTargetStore } from '@/features/message-quote';

export function ComposerReplyPreview({ thread }: { thread: { id: string } | null }) {
  const quote = useReplyTargetStore((state) => (thread ? state.targets[thread.id] : undefined));
  if (!thread || !quote) {
    return null;
  }
  const threadId = thread.id;
  return (
    <div className="mb-2">
      <ReplyPreview quote={quote} onClear={() => useReplyTargetStore.getState().clear(threadId)} />
    </div>
  );
}
