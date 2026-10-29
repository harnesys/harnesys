import { create } from 'zustand';
import { EXPLORER_EXPAND_STORAGE_KEY } from '@/shared/config/constants';

interface ExpandPersisted {
  roots: Record<string, boolean>;
  dirs: Record<string, string[]>;
  branches: Record<string, string[]>;
}

interface ExplorerExpandState {
  roots: Record<string, boolean>;
  dirs: Record<string, string[]>;
  branches: Record<string, string[]>;
  isRootOpen: (sourceId: string) => boolean;
  toggleRoot: (sourceId: string) => void;
  pruneRoots: (sourceIds: string[]) => void;
  isDirOpen: (sourceId: string, dirPath: string) => boolean;
  toggleDir: (sourceId: string, dirPath: string) => void;
  isBranchOpen: (sourceId: string, branchKey: string) => boolean;
  toggleBranch: (sourceId: string, branchKey: string) => void;
}

function load(): ExpandPersisted {
  try {
    const raw = localStorage.getItem(EXPLORER_EXPAND_STORAGE_KEY);
    if (!raw) {
      return { roots: {}, dirs: {}, branches: {} };
    }
    const parsed = JSON.parse(raw) as Partial<ExpandPersisted>;
    return {
      roots: parsed.roots && typeof parsed.roots === 'object' ? parsed.roots : {},
      dirs: parsed.dirs && typeof parsed.dirs === 'object' ? parsed.dirs : {},
      branches: parsed.branches && typeof parsed.branches === 'object' ? parsed.branches : {},
    };
  } catch {
    return { roots: {}, dirs: {}, branches: {} };
  }
}

function persist(state: ExpandPersisted): void {
  try {
    localStorage.setItem(EXPLORER_EXPAND_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

const initial = load();

export const useExplorerExpandStore = create<ExplorerExpandState>((set, get) => ({
  roots: initial.roots,
  dirs: initial.dirs,
  branches: initial.branches,
  isRootOpen: (sourceId) => get().roots[sourceId] === true,
  toggleRoot: (sourceId) => {
    set((state) => {
      const roots = { ...state.roots, [sourceId]: state.roots[sourceId] !== true };
      persist({ roots, dirs: state.dirs, branches: state.branches });
      return { roots };
    });
  },
  pruneRoots: (sourceIds) => {
    if (sourceIds.length === 0) {
      return;
    }
    set((state) => {
      const idSet = new Set(sourceIds);
      let changed = false;
      const roots: Record<string, boolean> = {};
      for (const [id, open] of Object.entries(state.roots)) {
        if (idSet.has(id)) {
          roots[id] = open;
        } else {
          changed = true;
        }
      }
      const dirs: Record<string, string[]> = {};
      for (const [id, paths] of Object.entries(state.dirs)) {
        if (idSet.has(id)) {
          dirs[id] = paths;
        } else {
          changed = true;
        }
      }
      const branches: Record<string, string[]> = {};
      for (const [id, keys] of Object.entries(state.branches)) {
        if (idSet.has(id)) {
          branches[id] = keys;
        } else {
          changed = true;
        }
      }
      if (!changed) {
        return state;
      }
      persist({ roots, dirs, branches });
      return { roots, dirs, branches };
    });
  },
  isDirOpen: (sourceId, dirPath) => {
    const paths = get().dirs[sourceId];
    return Boolean(paths?.includes(dirPath));
  },
  toggleDir: (sourceId, dirPath) => {
    set((state) => {
      const prev = state.dirs[sourceId] ?? [];
      const has = prev.includes(dirPath);
      const nextPaths = has ? prev.filter((p) => p !== dirPath) : [...prev, dirPath];
      const dirs = { ...state.dirs, [sourceId]: nextPaths };
      persist({ roots: state.roots, dirs, branches: state.branches });
      return { dirs };
    });
  },
  isBranchOpen: (sourceId, branchKey) => {
    const keys = get().branches[sourceId];
    return Boolean(keys?.includes(branchKey));
  },
  toggleBranch: (sourceId, branchKey) => {
    set((state) => {
      const prev = state.branches[sourceId] ?? [];
      const has = prev.includes(branchKey);
      const nextKeys = has ? prev.filter((k) => k !== branchKey) : [...prev, branchKey];
      const branches = { ...state.branches, [sourceId]: nextKeys };
      persist({ roots: state.roots, dirs: state.dirs, branches });
      return { branches };
    });
  },
}));
