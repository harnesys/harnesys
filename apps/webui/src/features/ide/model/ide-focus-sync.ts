import { useScheduleStore } from '@/entities/schedule';
import { setActiveThreadId, useThreadStore } from '@/entities/thread';
import { useWebhookStore } from '@/entities/webhook';
import { ensureThreadCached, useDeskStore } from '@/features/desk';
import type { StudioFocus, StudioFocusKind } from '@/shared/config/routes';
import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';
import { normalizeIdeFilePath, tabIdFor } from './ide-persist';
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
    schedule: syncScheduleFocus,
    webhook: syncWebhookFocus,
    spawn: syncSpawnFocus,
    terminal: syncTerminalFocus,
    board: syncBoardFocus,
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
    ide.openFile(projectId, remapped);
    ide.setActive(tabIdFor('file', projectId, remapped));
    return;
  }
  ide.openFile(projectId, normalized);
  ide.setActive(tabIdFor('file', projectId, normalized));
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
function syncScheduleFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'schedule') {
    return;
  }
  const schedule = useScheduleStore.getState().items.find((item) => item.id === focus.scheduleId);
  if (!schedule || schedule.projectId !== projectId) {
    return;
  }
  const ide = useIdeStore.getState();
  ide.openSchedule(projectId, schedule.id, schedule.threadId, schedule.targetAgentId);
  useDeskStore.getState().setFocusedThreadId(schedule.threadId);
  setActiveThreadId(schedule.targetAgentId, schedule.threadId);
  ide.setActive(tabIdFor('schedule', projectId, schedule.id));
}
function syncWebhookFocus({ focus, projectId }: FocusSyncArgs): void {
  if (focus.kind !== 'webhook') {
    return;
  }
  const webhook = useWebhookStore.getState().items.find((item) => item.id === focus.webhookId);
  if (!webhook || webhook.projectId !== projectId) {
    return;
  }
  const ide = useIdeStore.getState();
  ide.openWebhook(projectId, webhook.id, webhook.threadId, webhook.targetAgentId);
  useDeskStore.getState().setFocusedThreadId(webhook.threadId);
  setActiveThreadId(webhook.targetAgentId, webhook.threadId);
  ide.setActive(tabIdFor('webhook', projectId, webhook.id));
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
  ide.openSpawn(projectId, thread.agentId, focus.threadId, focus.spawnId);
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
function syncThreadFocus({ focus, projectId, org, navigate }: FocusSyncArgs): void {
  if (focus.kind !== 'thread') {
    return;
  }
  const thread = useThreadStore.getState().byId(focus.threadId);
  if (!thread) {
    void ensureThreadCached(focus.threadId).then((found) => {
      if (found) {
        syncThreadFocus({ focus, projectId, org, navigate });
      }
    });
    return;
  }
  if (thread.kind === 'schedule') {
    const schedule = useScheduleStore
      .getState()
      .items.find((item) => item.threadId === focus.threadId && item.projectId === projectId);
    if (schedule) {
      void navigate(studioPath.schedule(org, projectId, schedule.id), { replace: true });
      return;
    }
  }
  if (thread.kind === 'webhook') {
    const webhook = useWebhookStore
      .getState()
      .items.find((item) => item.threadId === focus.threadId && item.projectId === projectId);
    if (webhook) {
      void navigate(studioPath.webhook(org, projectId, webhook.id), { replace: true });
      return;
    }
  }
  const ide = useIdeStore.getState();
  ide.openThread(projectId, thread.agentId, focus.threadId);
  if (useDeskStore.getState().focusedThreadId !== focus.threadId) {
    useDeskStore.getState().setFocusedThreadId(focus.threadId);
  }
  setActiveThreadId(thread.agentId, focus.threadId);
  ide.setActive(tabIdFor('thread', projectId, focus.threadId));
}
