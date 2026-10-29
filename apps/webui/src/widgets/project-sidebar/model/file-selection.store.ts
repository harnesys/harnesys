import { create } from 'zustand';

interface FileSelectionState {
  projectId: string | null;
  scopeWorktreeId: string | null;
  selectedPaths: string[];
  anchorPath: string | null;
  visiblePaths: string[];
  filesActive: boolean;
}
type FileSelectionStore = FileSelectionState & {
  setProject: (projectId: string | null) => void;
  setScope: (projectId: string | null, worktreeId?: string | null) => void;
  setVisiblePaths: (paths: string[]) => void;
  setFilesActive: (active: boolean) => void;
  selectSingle: (path: string) => void;
  togglePath: (path: string) => void;
  selectRange: (targetPath: string) => void;
  setSelected: (paths: string[]) => void;
  clear: () => void;
};
export const useFileSelectionStore = create<FileSelectionStore>((set, _get) => ({
  projectId: null,
  scopeWorktreeId: null,
  selectedPaths: [],
  anchorPath: null,
  visiblePaths: [],
  filesActive: false,
  setProject: (projectId) =>
    set((state) => {
      if (state.projectId === projectId) {
        return state;
      }
      return {
        projectId,
        scopeWorktreeId: null,
        selectedPaths: [],
        anchorPath: null,
        visiblePaths: [],
        filesActive: false,
      };
    }),
  setScope: (projectId, worktreeId) =>
    set((state) => {
      const scope = worktreeId ?? null;
      if (state.projectId === projectId && state.scopeWorktreeId === scope) {
        return state;
      }
      return {
        projectId,
        scopeWorktreeId: scope,
        selectedPaths: [],
        anchorPath: null,
        visiblePaths: [],
        filesActive: false,
      };
    }),
  setVisiblePaths: (paths) => set({ visiblePaths: paths }),
  setFilesActive: (active) => set({ filesActive: active }),
  selectSingle: (path) => set({ selectedPaths: [path], anchorPath: path }),
  togglePath: (path) =>
    set((state) => {
      const exists = state.selectedPaths.includes(path);
      const next = exists
        ? state.selectedPaths.filter((p) => p !== path)
        : [...state.selectedPaths, path];
      return { selectedPaths: next, anchorPath: path };
    }),
  selectRange: (targetPath) =>
    set((state) => {
      const anchor = state.anchorPath;
      if (!anchor) {
        return { selectedPaths: [targetPath], anchorPath: targetPath };
      }
      const visible = state.visiblePaths;
      const aIdx = visible.indexOf(anchor);
      const tIdx = visible.indexOf(targetPath);
      if (aIdx === -1 || tIdx === -1) {
        return { selectedPaths: [targetPath], anchorPath: targetPath };
      }
      const start = Math.min(aIdx, tIdx);
      const end = Math.max(aIdx, tIdx);
      const slice = visible.slice(start, end + 1);
      return { selectedPaths: slice };
    }),
  setSelected: (paths) =>
    set({ selectedPaths: paths, anchorPath: paths[paths.length - 1] ?? null }),
  clear: () => set({ selectedPaths: [], anchorPath: null }),
}));
