import type { WorkspaceRef } from '@harnesys/contracts';
import { create } from 'zustand';

export type WorktreeWorkspaceRef = Extract<WorkspaceRef, { kind: 'worktree' }>;

export interface ThreadWorktreeBinding {
  workspaceRef: WorktreeWorkspaceRef;
  branch: string;
  hostId: string;
}

interface ThreadWorktreeState {
  byThread: Record<string, ThreadWorktreeBinding | undefined>;
  bind: (threadId: string, binding: ThreadWorktreeBinding) => void;
  unbind: (threadId: string) => void;
  get: (threadId: string) => ThreadWorktreeBinding | undefined;
}

export const useThreadWorktreeStore = create<ThreadWorktreeState>((set, get) => ({
  byThread: {},
  bind: (threadId, binding) =>
    set((state) => ({
      byThread: { ...state.byThread, [threadId]: binding },
    })),
  unbind: (threadId) =>
    set((state) => {
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    }),
  get: (threadId) => get().byThread[threadId],
}));
