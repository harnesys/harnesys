import { create } from 'zustand';

export type SseConnectionState = 'open' | 'reconnecting';

interface SseConnectionStore {
  byOrg: Record<string, SseConnectionState>;
  mark: (orgId: string, state: SseConnectionState) => void;
  clear: (orgId: string) => void;
}

export const useSseConnectionStore = create<SseConnectionStore>((set) => ({
  byOrg: {},
  mark: (orgId, state) =>
    set((current) =>
      current.byOrg[orgId] === state
        ? current
        : { byOrg: { ...current.byOrg, [orgId]: state } },
    ),
  clear: (orgId) =>
    set((current) => {
      if (!current.byOrg[orgId]) {
        return current;
      }
      const next = { ...current.byOrg };
      delete next[orgId];
      return { byOrg: next };
    }),
}));

export function setSseConnectionState(orgId: string, state: SseConnectionState): void {
  if (!orgId) {
    return;
  }
  useSseConnectionStore.getState().mark(orgId, state);
}
