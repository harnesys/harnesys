import { create } from 'zustand';

export interface IssueDrawerTarget {
  issueId: string;
  draft: boolean;
}

interface IssueDrawerState {
  target: IssueDrawerTarget | null;
  openIssue: (issueId: string) => void;
  openDraft: (issueId: string) => void;
  markCommitted: () => void;
  close: () => void;
}

export const useIssueDrawerStore = create<IssueDrawerState>((set) => ({
  target: null,
  openIssue: (issueId) => set({ target: { issueId, draft: false } }),
  openDraft: (issueId) => set({ target: { issueId, draft: true } }),
  markCommitted: () =>
    set((state) => (state.target ? { target: { ...state.target, draft: false } } : state)),
  close: () => set({ target: null }),
}));
