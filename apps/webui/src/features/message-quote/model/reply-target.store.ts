import type { MessageQuote } from '@harnesys/contracts';
import { create } from 'zustand';

interface ReplyTargetState {
  targets: Record<string, MessageQuote | undefined>;
  set: (threadId: string, quote: MessageQuote) => void;
  clear: (threadId: string) => void;
}

export const useReplyTargetStore = create<ReplyTargetState>((set) => ({
  targets: {},
  set(threadId, quote) {
    set((state) => ({ targets: { ...state.targets, [threadId]: quote } }));
  },
  clear(threadId) {
    set((state) => {
      if (state.targets[threadId] === undefined) {
        return state;
      }
      const { [threadId]: _cleared, ...rest } = state.targets;
      return { targets: rest };
    });
  },
}));
