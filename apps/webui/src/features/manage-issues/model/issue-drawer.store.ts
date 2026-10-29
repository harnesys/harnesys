import { create } from 'zustand';

export type IssueDrawerTarget =
  | { mode: 'edit'; issueId: string }
  | { mode: 'create'; boardId: string; statusKey: string; parentIssueId?: string };

interface IssueDrawerState {
  target: IssueDrawerTarget | null;
  openIssue: (issueId: string) => void;
  startCreate: (boardId: string, statusKey: string, parentIssueId?: string) => void;
  close: () => void;
}

export const useIssueDrawerStore = create<IssueDrawerState>((set) => ({
  target: null,
  openIssue: (issueId) => set({ target: { mode: 'edit', issueId } }),
  startCreate: (boardId, statusKey, parentIssueId) =>
    set({ target: { mode: 'create', boardId, statusKey, parentIssueId } }),
  close: () => set({ target: null }),
}));
