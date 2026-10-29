import { create } from 'zustand';

const STORAGE_KEY = 'harnesys.worktrees-hidden-v1';

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>;
    }
    return {};
  } catch {
    return {};
  }
}

interface WorktreesVisibilityState {
  hidden: Record<string, boolean>;
  setHidden: (projectId: string, hidden: boolean) => void;
  toggle: (projectId: string) => void;
}

export const useWorktreesVisibilityStore = create<WorktreesVisibilityState>((set) => ({
  hidden: load(),
  setHidden: (projectId, hidden) =>
    set((state) => {
      const next = { ...state.hidden };
      if (hidden) {
        next[projectId] = true;
      } else {
        delete next[projectId];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return { hidden: next };
    }),
  toggle: (projectId) =>
    set((state) => {
      const next = { ...state.hidden };
      if (next[projectId]) {
        delete next[projectId];
      } else {
        next[projectId] = true;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return { hidden: next };
    }),
}));

export function useWorktreesHidden(projectId: string): boolean {
  return useWorktreesVisibilityStore((state) => state.hidden[projectId] === true);
}
