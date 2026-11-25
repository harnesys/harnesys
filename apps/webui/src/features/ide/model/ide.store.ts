import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { setDeskWorkspaceReader, setDeskWorkspaceWriter } from '@/features/desk/model/desk-chrome';
import type { FileRef } from '@/features/open-file';
import { getActiveOrgId } from '@/shared/api/active-org';
import { randomUUID } from '@/shared/lib/random-uuid';
import { fileTabFromTarget, fileTabId } from './ide-file-tab';
import {
  closeGroupState,
  closeTabState,
  groupOfTab,
  type IdeGroup,
  type IdeSplitSide,
  type IdeWorkspaceState,
  moveTabState,
  setSplitRatioState,
  splitGroupState,
  upsertTabState,
  withActiveTabState,
} from './ide-layout';
import { remapProjectPaths } from './ide-path-remap';
import { loadPersisted, persist, workspaceFromPersisted } from './ide-persist';
import { normalizeIdeFilePath, tabIdFor } from './ide-tab-id';

export { firstGroupOfLayout, type IdeSplitNode, lastGroupOfLayout } from './ide-tree';
export type IdeTabKind = 'thread' | 'file' | 'spawn' | 'diff' | 'terminal' | 'board' | 'dashboard';
export interface IdeTab {
  id: string;
  kind: IdeTabKind;
  projectId: string;
  agentId?: string;
  spawnAgentId?: string;
  threadId?: string;
  spawnId?: string;
  terminalSessionId?: string;
  boardId?: string;
  dashboardId?: string;
  target?: FileRef;
  path?: string;
  worktreeId?: string;
  worktreeBranch?: string;
  dirty?: boolean;
}
export type { IdeGroup, IdeSplitOrientation, IdeSplitSide, IdeWorkspaceState } from './ide-layout';

export interface OpenAttachmentInput {
  issueId: string;
  attachmentId: string;
  name: string;
  mediaType: string;
}

interface IdeState {
  workspace: IdeWorkspaceState;
}
type IdeStore = IdeState & {
  openThread: (projectId: string, agentId: string, threadId: string) => void;
  openSpawn: (
    projectId: string,
    agentId: string,
    threadId: string,
    spawnId: string,
    spawnAgentId?: string,
  ) => void;
  openFile: (target: FileRef) => void;
  openDiff: (projectId: string, path: string) => void;
  openBoard: (projectId: string, boardId: string) => void;
  openDashboard: (projectId: string, dashboardId: string) => void;
  openTerminal: (projectId: string, sessionId: string) => void;
  closeTab: (tabId: string) => void;
  closeAll: () => void;
  closeProjectTabs: (projectId: string) => void;
  setActive: (tabId: string) => void;
  setFileDirty: (target: FileRef, dirty: boolean) => void;
  closeByEntity: (
    projectId: string,
    kind: IdeTabKind,
    entityId: string,
    worktreeId?: string,
  ) => void;
  remapPaths: (projectId: string, moves: ProjectMoveItem[], worktreeId?: string) => void;
  reorderTab: (fromId: string, toId: string, after: boolean) => void;
  moveTab: (tabId: string, toGroupId: string, anchorTabId: string | null, after?: boolean) => void;
  splitGroup: (groupId: string, side: IdeSplitSide, tabId?: string) => void;
  closeGroup: (groupId: string) => void;
  setSplitRatio: (splitId: string, ratio: number) => void;
};
function withWs(
  state: IdeState,
  next: IdeWorkspaceState | null,
): IdeState | Pick<IdeStore, 'workspace'> {
  return next ? { workspace: next } : state;
}
export const useIdeStore = create<IdeStore>((set) => ({
  workspace: loadPersisted(),
  openThread: (projectId, agentId, threadId) =>
    set((state) => {
      const id = tabIdFor('thread', projectId, threadId);
      const tab: IdeTab = { id, kind: 'thread', projectId, agentId, threadId };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openSpawn: (projectId, agentId, threadId, spawnId, spawnAgentId) =>
    set((state) => {
      const id = tabIdFor('spawn', projectId, `${threadId}:${spawnId}`);
      const tab: IdeTab = {
        id,
        kind: 'spawn',
        projectId,
        agentId,
        spawnAgentId,
        threadId,
        spawnId,
      };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openFile: (target) =>
    set((state) =>
      withWs(
        state,
        upsertTabState(state.workspace, fileTabFromTarget(target, getActiveOrgId() ?? '', false)),
      ),
    ),
  openDiff: (projectId, path) =>
    set((state) => {
      const normalized = normalizeIdeFilePath(path);
      const id = tabIdFor('diff', projectId, normalized);
      const tab: IdeTab = { id, kind: 'diff', projectId, path: normalized };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openBoard: (projectId, boardId) =>
    set((state) => {
      const id = tabIdFor('board', projectId, boardId);
      const tab: IdeTab = { id, kind: 'board', projectId, boardId };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openDashboard: (projectId, dashboardId) =>
    set((state) => {
      const id = tabIdFor('dashboard', projectId, dashboardId);
      const tab: IdeTab = { id, kind: 'dashboard', projectId, dashboardId };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openTerminal: (projectId, sessionId) =>
    set((state) => {
      const id = tabIdFor('terminal', projectId, sessionId);
      const tab: IdeTab = {
        id,
        kind: 'terminal',
        projectId,
        terminalSessionId: sessionId,
      };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  closeTab: (tabId) => set((state) => withWs(state, closeTabState(state.workspace, tabId))),
  closeAll: () => set(() => ({ workspace: loadPersisted() })),
  closeProjectTabs: (projectId) =>
    set((state) => {
      let ws = state.workspace;
      for (const tab of [...ws.tabs]) {
        if (tab.projectId !== projectId) {
          continue;
        }
        ws = closeTabState(ws, tab.id) ?? ws;
      }
      return { workspace: ws };
    }),
  setActive: (tabId) => set((state) => withWs(state, withActiveTabState(state.workspace, tabId))),
  setFileDirty: (target, dirty) =>
    set((state) => {
      const id = fileTabId(target, getActiveOrgId() ?? '');
      const idx = state.workspace.tabs.findIndex((t) => t.id === id);
      if (idx === -1 || state.workspace.tabs[idx]?.dirty === dirty) {
        return state;
      }
      return {
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)),
        },
      };
    }),
  closeByEntity: (projectId, kind, entityId, worktreeId) =>
    set((state) =>
      withWs(
        state,
        closeTabState(
          state.workspace,
          kind === 'file'
            ? fileTabId(
                {
                  source: 'project',
                  projectId,
                  path: entityId,
                  ...(worktreeId ? { worktreeId } : {}),
                },
                projectId,
              )
            : tabIdFor(kind, projectId, entityId),
        ),
      ),
    ),
  remapPaths: (projectId, moves, worktreeId) =>
    set((state) => {
      if (moves.length === 0) {
        return state;
      }
      const next = remapProjectPaths(state.workspace, moves, projectId, worktreeId);
      return next ? { workspace: next } : state;
    }),
  reorderTab: (fromId, toId, after) =>
    set((state) => {
      const group = groupOfTab(state.workspace, fromId);
      if (!group) {
        return state;
      }
      return withWs(state, moveTabState(state.workspace, fromId, group.id, toId, after));
    }),
  moveTab: (tabId, toGroupId, anchorTabId, after) =>
    set((state) =>
      withWs(state, moveTabState(state.workspace, tabId, toGroupId, anchorTabId, after)),
    ),
  splitGroup: (groupId, side, tabId) =>
    set((state) =>
      withWs(state, splitGroupState(state.workspace, groupId, side, randomUUID(), tabId)),
    ),
  closeGroup: (groupId) => set((state) => withWs(state, closeGroupState(state.workspace, groupId))),
  setSplitRatio: (splitId, ratio) =>
    set((state) => withWs(state, setSplitRatioState(state.workspace, splitId, ratio))),
}));
useIdeStore.subscribe((state) => persist(state.workspace));
setDeskWorkspaceReader(() => useIdeStore.getState().workspace);
setDeskWorkspaceWriter((persisted) => {
  useIdeStore.setState({ workspace: workspaceFromPersisted(persisted) });
});
export function useIdeTabs(): IdeWorkspaceState {
  return useIdeStore((state) => state.workspace);
}
export function useIdeGroup(groupId: string): IdeGroup | null {
  return useIdeStore((state) => state.workspace.groups.find((g) => g.id === groupId) ?? null);
}
export function ideTabId(kind: IdeTabKind, projectId: string, key: string): string {
  return tabIdFor(kind, projectId, key);
}
