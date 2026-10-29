import { create } from 'zustand';
import type { LspBridgeStatus } from './lsp-bridge';
export interface LspSessionEntry {
  path: string;
  languageId: string;
  status: LspBridgeStatus;
  message?: string;
}
const EMPTY_SESSIONS: LspSessionEntry[] = [];
interface LspSessionsState {
  byProject: Record<string, LspSessionEntry[]>;
  upsert: (projectId: string, entry: LspSessionEntry) => void;
  remove: (projectId: string, path: string) => void;
}
export const useLspSessionsStore = create<LspSessionsState>((set) => ({
  byProject: {},
  upsert: (projectId, entry) =>
    set((state) => {
      const list = state.byProject[projectId] ?? EMPTY_SESSIONS;
      const idx = list.findIndex((item) => item.path === entry.path);
      if (idx === -1) {
        return { byProject: { ...state.byProject, [projectId]: [...list, entry] } };
      }
      const current = list[idx];
      if (
        current &&
        current.languageId === entry.languageId &&
        current.status === entry.status &&
        current.message === entry.message
      ) {
        return state;
      }
      return {
        byProject: {
          ...state.byProject,
          [projectId]: list.map((item, i) => (i === idx ? entry : item)),
        },
      };
    }),
  remove: (projectId, path) =>
    set((state) => {
      const list = state.byProject[projectId];
      if (!list) {
        return state;
      }
      return {
        byProject: {
          ...state.byProject,
          [projectId]: list.filter((item) => item.path !== path),
        },
      };
    }),
}));
export function useLspSessions(projectId: string | null): LspSessionEntry[] {
  return useLspSessionsStore((state) =>
    projectId ? (state.byProject[projectId] ?? EMPTY_SESSIONS) : EMPTY_SESSIONS,
  );
}
