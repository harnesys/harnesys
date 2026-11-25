import type { MessageQuote } from '@harnesys/contracts';
import { useReplyTargetStore } from '@/features/message-quote';

export interface ComposerReplyQuote {
  target: MessageQuote | undefined;
  options: {
    quote?: MessageQuote;
    clearQuote?: () => void;
    restoreQuote?: () => void;
  };
}

export function useReplyQuote(thread: { id: string } | null | undefined): ComposerReplyQuote {
  const threadId = thread ? thread.id : null;
  const target = useReplyTargetStore((state) => (threadId ? state.targets[threadId] : undefined));
  if (!threadId || !target) {
    return { target: undefined, options: {} };
  }
  return {
    target,
    options: {
      quote: target,
      clearQuote: () => useReplyTargetStore.getState().clear(threadId),
      restoreQuote: () => useReplyTargetStore.getState().set(threadId, target),
    },
  };
}
