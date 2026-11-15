import { create } from 'zustand';

export interface ViewerCreateTemplate {
  addonId: string;
  viewerId: string;
  extension: string;
  /** Full menu label authored by the add-on, e.g. "New Draw.io". */
  label: string;
  /** Descriptor icon: lucide name or inline SVG data URI. */
  icon?: string;
}

export interface ExplorerCreateDraft {
  kind: 'file' | 'dir';
  parentPath: string;
  projectId: string;
  template?: ViewerCreateTemplate;
}

interface ExplorerDraftState {
  draft: ExplorerCreateDraft | null;
  start: (
    kind: 'file' | 'dir',
    parentPath: string,
    projectId: string,
    template?: ViewerCreateTemplate,
  ) => void;
  cancel: () => void;
}

export const useExplorerDraftStore = create<ExplorerDraftState>((set) => ({
  draft: null,
  start: (kind, parentPath, projectId, template) =>
    set({ draft: { kind, parentPath, projectId, ...(template ? { template } : {}) } }),
  cancel: () => set({ draft: null }),
}));
