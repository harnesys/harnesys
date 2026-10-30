import type { ProjectMoveItem } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { setDeskWorkspaceReader, setDeskWorkspaceWriter } from '@/features/desk/model/desk-chrome';
import { randomUUID } from '@/shared/lib/random-uuid';
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
import {
  fileTabKey,
  loadPersisted,
  normalizeIdeFilePath,
  persist,
  tabIdFor,
  workspaceFromPersisted,
} from './ide-persist';

export { firstGroupOfLayout, type IdeSplitNode, lastGroupOfLayout } from './ide-tree';
export type IdeTabKind =
  | 'thread'
  | 'file'
  | 'spawn'
  | 'diff'
  | 'schedule'
  | 'webhook'
  | 'terminal'
  | 'board'
  | 'attachment'
  | 'thread-file';
export interface IdeTab {
  id: string;
  kind: IdeTabKind;
  projectId: string;
  agentId?: string;
  threadId?: string;
  spawnId?: string;
  scheduleId?: string;
  webhookId?: string;
  terminalSessionId?: string;
  boardId?: string;
  issueId?: string;
  attachmentId?: string;
  mediaType?: string;
  path?: string;
  worktreeId?: string;
  worktreeBranch?: string;
  dirty?: boolean;
}
export type { IdeGroup, IdeSplitSide, IdeWorkspaceState } from './ide-layout';

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
  openSpawn: (projectId: string, agentId: string, threadId: string, spawnId: string) => void;
  openFile: (projectId: string, path: string, worktreeId?: string, worktreeBranch?: string) => void;
  openDiff: (projectId: string, path: string) => void;
  openSchedule: (projectId: string, scheduleId: string, threadId: string, agentId: string) => void;
  openWebhook: (projectId: string, webhookId: string, threadId: string, agentId: string) => void;
  openBoard: (projectId: string, boardId: string) => void;
  openAttachment: (projectId: string, input: OpenAttachmentInput) => void;
  openThreadFile: (
    projectId: string,
    threadId: string,
    path: string,
    attachmentId?: string,
  ) => void;
  openTerminal: (projectId: string, sessionId: string) => void;
  closeTab: (tabId: string) => void;
  closeAll: () => void;
  closeProjectTabs: (projectId: string) => void;
  setActive: (tabId: string) => void;
  setFileDirty: (projectId: string, path: string, dirty: boolean, worktreeId?: string) => void;
  closeByEntity: (
    projectId: string,
    kind: IdeTabKind,
    entityId: string,
    worktreeId?: string,
  ) => void;
  remapPaths: (projectId: string, moves: ProjectMoveItem[], worktreeId?: string) => void;
  reorderTab: (fromId: string, toId: string) => void;
  moveTab: (tabId: string, toGroupId: string, beforeTabId: string | null) => void;
  splitGroup: (groupId: string, side: IdeSplitSide) => void;
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
  openSpawn: (projectId, agentId, threadId, spawnId) =>
    set((state) => {
      const id = tabIdFor('spawn', projectId, `${threadId}:${spawnId}`);
      const tab: IdeTab = { id, kind: 'spawn', projectId, agentId, threadId, spawnId };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openFile: (projectId, path, worktreeId, worktreeBranch) =>
    set((state) => {
      const key = fileTabKey(path, worktreeId);
      const id = tabIdFor('file', projectId, key);
      const tab: IdeTab = {
        id,
        kind: 'file',
        projectId,
        path: normalizeIdeFilePath(path),
        ...(worktreeId ? { worktreeId } : {}),
        ...(worktreeBranch ? { worktreeBranch } : {}),
        dirty: false,
      };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openDiff: (projectId, path) =>
    set((state) => {
      const normalized = normalizeIdeFilePath(path);
      const id = tabIdFor('diff', projectId, normalized);
      const tab: IdeTab = { id, kind: 'diff', projectId, path: normalized };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openSchedule: (projectId, scheduleId, threadId, agentId) =>
    set((state) => {
      const id = tabIdFor('schedule', projectId, scheduleId);
      const tab: IdeTab = {
        id,
        kind: 'schedule',
        projectId,
        scheduleId,
        threadId,
        agentId,
      };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openWebhook: (projectId, webhookId, threadId, agentId) =>
    set((state) => {
      const id = tabIdFor('webhook', projectId, webhookId);
      const tab: IdeTab = {
        id,
        kind: 'webhook',
        projectId,
        webhookId,
        threadId,
        agentId,
      };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openBoard: (projectId, boardId) =>
    set((state) => {
      const id = tabIdFor('board', projectId, boardId);
      const tab: IdeTab = { id, kind: 'board', projectId, boardId };
      return withWs(state, upsertTabState(state.workspace, tab));
    }),
  openAttachment: (projectId, input) =>
    set((state) => {
      const id = tabIdFor('attachment', projectId, input.attachmentId);
      const tab: IdeTab = {
        id,
        kind: 'attachment',
        projectId,
        issueId: input.issueId,
        attachmentId: input.attachmentId,
        mediaType: input.mediaType,
        path: input.name,
      };
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
  openThreadFile: (projectId, threadId, path, attachmentId) =>
    set((state) => {
      const key = attachmentId
        ? `${threadId}:att:${attachmentId}`
        : `${threadId}:${normalizeIdeFilePath(path)}`;
      const id = tabIdFor('thread-file', projectId, key);
      const tab: IdeTab = {
        id,
        kind: 'thread-file',
        projectId,
        threadId,
        path,
        ...(attachmentId ? { attachmentId } : {}),
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
  setFileDirty: (projectId, path, dirty, worktreeId) =>
    set((state) => {
      const id = tabIdFor('file', projectId, fileTabKey(path, worktreeId));
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
            ? tabIdFor(kind, projectId, fileTabKey(entityId, worktreeId))
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
  reorderTab: (fromId, toId) =>
    set((state) => {
      const group = groupOfTab(state.workspace, fromId);
      if (!group) {
        return state;
      }
      return withWs(state, moveTabState(state.workspace, fromId, group.id, toId));
    }),
  moveTab: (tabId, toGroupId, beforeTabId) =>
    set((state) => withWs(state, moveTabState(state.workspace, tabId, toGroupId, beforeTabId))),
  splitGroup: (groupId, side) =>
    set((state) => withWs(state, splitGroupState(state.workspace, groupId, side, randomUUID()))),
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
