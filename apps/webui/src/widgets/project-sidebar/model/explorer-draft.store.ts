import { create } from 'zustand';
export interface ExplorerCreateDraft {
  kind: 'file' | 'dir';
  parentPath: string;
  projectId: string;
}
interface ExplorerDraftState {
  draft: ExplorerCreateDraft | null;
  start: (kind: 'file' | 'dir', parentPath: string, projectId: string) => void;
  cancel: () => void;
}
export const useExplorerDraftStore = create<ExplorerDraftState>((set) => ({
  draft: null,
  start: (kind, parentPath, projectId) => set({ draft: { kind, parentPath, projectId } }),
  cancel: () => set({ draft: null }),
}));
