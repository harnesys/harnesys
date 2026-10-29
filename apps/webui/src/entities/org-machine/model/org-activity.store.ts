import { create } from 'zustand';

interface OrgActivityState {
  unreadByOrg: Record<string, number>;
  bump: (orgId: string, delta: number) => void;
  clear: (orgId: string) => void;
}

export const useOrgActivityStore = create<OrgActivityState>((set) => ({
  unreadByOrg: {},
  bump: (orgId, delta) =>
    set((state) => ({
      unreadByOrg: { ...state.unreadByOrg, [orgId]: (state.unreadByOrg[orgId] ?? 0) + delta },
    })),
  clear: (orgId) =>
    set((state) => {
      if (!state.unreadByOrg[orgId]) {
        return state;
      }
      const next = { ...state.unreadByOrg };
      delete next[orgId];
      return { unreadByOrg: next };
    }),
}));
