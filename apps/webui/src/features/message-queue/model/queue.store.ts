import { create } from 'zustand';
import { listThreadQueue, queueThreadMessage, type ThreadQueueItem } from '@/shared/api';

interface ThreadQueueState {
  items: Record<string, ThreadQueueItem[]>;
  apply: (threadId: string, items: ThreadQueueItem[]) => void;
  refresh: (threadId: string) => Promise<void>;
  add: (
    threadId: string,
    body: { text: string; clientEventId?: string },
  ) => Promise<ThreadQueueItem[]>;
  discardDelivered: (threadId: string, clientEventId: string) => void;
  clear: (threadId: string) => void;
}

export const useThreadQueueStore = create<ThreadQueueState>((set) => ({
  items: {},
  apply(threadId, items) {
    set((state) => ({ items: { ...state.items, [threadId]: items } }));
  },
  async refresh(threadId) {
    try {
      const items = await listThreadQueue(threadId);
      set((state) => ({ items: { ...state.items, [threadId]: items } }));
    } catch {}
  },
  async add(threadId, body) {
    const items = await queueThreadMessage(threadId, body);
    set((state) => ({ items: { ...state.items, [threadId]: items } }));
    return items;
  },
  discardDelivered(threadId, clientEventId) {
    set((state) => {
      const items = state.items[threadId];
      if (items === undefined || !items.some((item) => item.clientEventId === clientEventId)) {
        return state;
      }
      return {
        items: {
          ...state.items,
          [threadId]: items.filter((item) => item.clientEventId !== clientEventId),
        },
      };
    });
  },
  clear(threadId) {
    set((state) => {
      const { [threadId]: _gone, ...rest } = state.items;
      return { items: rest };
    });
  },
}));
