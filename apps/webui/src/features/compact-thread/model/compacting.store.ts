import { create } from 'zustand';

interface CompactingStore {
  byThread: Record<string, true>;
  begin(threadId: string, controller?: AbortController): boolean;
  end(threadId: string): void;
  abort(threadId: string): void;
  isCompacting(threadId: string): boolean;
}
const controllers = new Map<string, AbortController>();
export const useCompactingStore = create<CompactingStore>((set, get) => ({
  byThread: {},
  begin(threadId, controller) {
    if (get().byThread[threadId]) {
      controller?.abort();
      return false;
    }
    if (controller) {
      controllers.set(threadId, controller);
    }
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: true },
    }));
    return true;
  },
  end(threadId) {
    controllers.delete(threadId);
    set((state) => {
      if (!state.byThread[threadId]) {
        return state;
      }
      const { [threadId]: _, ...rest } = state.byThread;
      return { byThread: rest };
    });
  },
  abort(threadId) {
    controllers.get(threadId)?.abort();
  },
  isCompacting(threadId) {
    return Boolean(get().byThread[threadId]);
  },
}));
