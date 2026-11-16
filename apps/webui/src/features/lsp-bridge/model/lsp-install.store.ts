import { create } from 'zustand';

interface LspInstallState {
  installing: Record<string, boolean>;
  version: number;
  setInstalling: (key: string, value: boolean) => void;
  markInstalled: () => void;
}

export const useLspInstallStore = create<LspInstallState>((set) => ({
  installing: {},
  version: 0,
  setInstalling: (key, value) =>
    set((state) => {
      if (Boolean(state.installing[key]) === value) {
        return state;
      }
      return { installing: { ...state.installing, [key]: value } };
    }),
  markInstalled: () => set((state) => ({ version: state.version + 1 })),
}));

export function lspInstallKey(orgId: string, serverId: string): string {
  return `${orgId}:${serverId}`;
}
