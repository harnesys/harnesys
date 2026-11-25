import { useSessionStore } from '@/entities/session';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { ensureThreadCached, useDeskStore } from '@/features/desk';
import type { StudioFocus, StudioFocusKind } from '@/shared/config/routes';
import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';
import { fileTabId } from './ide-file-tab';
import { normalizeIdeFilePath, tabIdFor } from './ide-tab-id';
import { remappedPathAfterMove } from './recent-path-moves';

type Navigate = (to: string, options?: { replace: boolean }) => void;
interface FocusSyncArgs {
  focus: StudioFocus;
  projectId: string;
  org: string;
  navigate: Navigate;
}
type FocusHandler = (args: FocusSyncArgs) => void;
type FocusKind = StudioFocusKind | 'none' | 'settings';

export function syncIdeFocus({ focus, projectId, org, navigate }: FocusSyncArgs): void {
  const handlers: Partial<Record<FocusKind, FocusHandler>> = {
    file: syncFileFocus,
    diff: syncDiffFocus,
    spawn: syncSpawnFocus,
    terminal: syncTerminalFocus,
    board: syncBoardFocus,
    dashboard: syncDashboardFocus,
    thread: syncThreadFocus,
  };
  handlers[focus.kind]?.({ focus, projectId, org, navigate });
}
function syncFileFocus({ focus, projectId, org, navigate }: FocusSyncArgs): void {
  if (focus.kind !== 'file') {
    return;
  }
  const normalized = normalizeIdeFilePath(focus.path);
  const remapped = remappedPathAfterMove(projectId, normalized);
  const ide = useIdeStore.getState();
  if (remapped) {
    void navigate(studioPath.file(org, projectId, remapped), { replace: true });
    const target = { source: 'project' as const, projectId, path: remapped };
    ide.openFile(target);
    ide.setActive(fileTabId(target, projectId));
    return;
  }
  const target = { source: 'project' as const, projectId, path: normalized };
  ide.openFile(target);
  ide.setActive(fileTabId(target, projectId));
}
function syncDiffFocus({ focus, projectId, org, navigate }: FocusSyncArgs): void {
  if (focus.kind !== 'diff') {
    return;
  }
  const normalized = normalizeIdeFilePath(focus.path);
  const remapped = remappedPathAfterMove(projectId, normalized);
  const ide = useIdeStore.getState();
  if (remapped) {
    void navigate(studioPath.diff(org, projectId, remapped), { replace: true });
    ide.openDiff(projectId, remapped);
    ide.setActive(tabIdFor('diff', projectId, remapped));
    return;
  }
  ide.openDiff(projectId, normalized);
  ide.setActive(tabIdFor('diff', projectId, normalized));
}
function syncSpawnFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'spawn') {
    return;
  }
  const thread = useThreadStore.getState().byId(focus.threadId);
  if (!thread) {
    return;
  }
  const ide = useIdeStore.getState();
  const spawnAgentId = useSessionStore
    .getState()
    .feeds[focus.threadId]?.spawns.find((spawn) => spawn.spawnId === focus.spawnId)?.agentId;
  ide.openSpawn(projectId, thread.agentId, focus.threadId, focus.spawnId, spawnAgentId);
  useDeskStore.getState().setFocusedThreadId(focus.threadId);
  ide.setActive(tabIdFor('spawn', projectId, `${focus.threadId}:${focus.spawnId}`));
}
function syncTerminalFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'terminal') {
    return;
  }
  const ide = useIdeStore.getState();
  ide.openTerminal(projectId, focus.sessionId);
  ide.setActive(tabIdFor('terminal', projectId, focus.sessionId));
}
function syncBoardFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'board') {
    return;
  }
  const ide = useIdeStore.getState();
  ide.openBoard(projectId, focus.boardId);
  ide.setActive(tabIdFor('board', projectId, focus.boardId));
}
function syncDashboardFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'dashboard') {
    return;
  }
  const ide = useIdeStore.getState();
  ide.openDashboard(projectId, focus.dashboardId);
  ide.setActive(tabIdFor('dashboard', projectId, focus.dashboardId));
}
function syncThreadFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'thread') {
    return;
  }
  const thread = useThreadStore.getState().byId(focus.threadId);
  if (!thread) {
    void ensureThreadCached(focus.threadId).then((found) => {
      if (found) {
        syncThreadFocus({ focus, projectId, org: '', navigate: () => {} });
      }
    });
    return;
  }
  const ide = useIdeStore.getState();
  ide.openThread(projectId, thread.agentId, focus.threadId);
  if (useDeskStore.getState().focusedThreadId !== focus.threadId) {
    useDeskStore.getState().setFocusedThreadId(focus.threadId);
  }
  setActiveThreadId(thread.agentId, focus.threadId);
  ide.setActive(tabIdFor('thread', projectId, focus.threadId));
}
