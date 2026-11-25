import { create } from 'zustand';

export type InspectorTab = 'files' | 'inspector' | 'memory' | 'requests';

interface DeskState {
  inspectorTab: InspectorTab;
  inspectorOpen: boolean;
  focusedThreadId: string | null;
}
type DeskStore = DeskState & {
  setFocusedThreadId: (threadId: string | null) => void;
  setInspectorTab: (tab: InspectorTab) => void;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
};
const initialDesk: DeskState = {
  inspectorTab: 'inspector',
  inspectorOpen: false,
  focusedThreadId: null,
};
export const useDeskStore = create<DeskStore>((set) => ({
  ...initialDesk,
  setFocusedThreadId: (threadId) => set({ focusedThreadId: threadId }),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setInspectorOpen: (open) => set({ inspectorOpen: open }),
}));
