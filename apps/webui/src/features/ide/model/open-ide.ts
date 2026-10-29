import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useDeskStore } from '@/features/desk';
import { createTerminal, terminalsQueryKey } from '@/shared/api/terminals';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import type { IdeTab } from './ide.store';
import { type OpenAttachmentInput, useIdeStore } from './ide.store';
export function pathForIdeTab(orgId: string, projectId: string, tab: IdeTab): string | null {
  if (tab.kind === 'thread' && tab.threadId) {
    return studioPath.thread(orgId, projectId, tab.threadId);
  }
  if (tab.kind === 'file' && tab.path) {
    if (tab.worktreeId) {
      return null;
    }
    return studioPath.file(orgId, projectId, tab.path);
  }
  if (tab.kind === 'diff' && tab.path) {
    return studioPath.diff(orgId, projectId, tab.path);
  }
  if (tab.kind === 'schedule' && tab.scheduleId) {
    return studioPath.schedule(orgId, projectId, tab.scheduleId);
  }
  if (tab.kind === 'webhook' && tab.webhookId) {
    return studioPath.webhook(orgId, projectId, tab.webhookId);
  }
  if (tab.kind === 'board' && tab.boardId) {
    return studioPath.board(orgId, tab.boardId);
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return studioPath.spawn(orgId, projectId, tab.threadId, tab.spawnId);
  }
  if (tab.kind === 'terminal' && tab.terminalSessionId) {
    return studioPath.terminal(orgId, projectId, tab.terminalSessionId);
  }
  if (tab.kind === 'attachment' && tab.issueId && tab.attachmentId) {
    return studioPath.attachment(orgId, tab.projectId, tab.issueId, tab.attachmentId);
  }
  return null;
}
export function useOpenIdeTab(orgId: string) {
  const navigate = useNavigate();
  return (projectId: string, tab: IdeTab) => {
    const path = pathForIdeTab(orgId, projectId, tab);
    if (path) {
      void navigate(path);
    }
  };
}
export function useOpenAttachmentTab(orgId: string) {
  const navigate = useNavigate();
  return (projectId: string, input: OpenAttachmentInput) => {
    useIdeStore.getState().openAttachment(projectId, input);
    void navigate(studioPath.attachment(orgId, projectId, input.issueId, input.attachmentId));
  };
}
export function useOpenThreadTab() {
  const { openThread } = useStudioNavigation();
  return useCallback(
    (projectId: string, agentId: string, threadId: string) => {
      useIdeStore.getState().openThread(projectId, agentId, threadId);
      useDeskStore.getState().setFocusedThreadId(threadId);
      openThread(projectId, threadId);
    },
    [openThread],
  );
}
export function useOpenSpawnTab() {
  const { openSpawn } = useStudioNavigation();
  return useCallback(
    (projectId: string, agentId: string, threadId: string, spawnId: string) => {
      useIdeStore.getState().openSpawn(projectId, agentId, threadId, spawnId);
      useDeskStore.getState().setFocusedThreadId(threadId);
      openSpawn(projectId, threadId, spawnId);
    },
    [openSpawn],
  );
}
export function useOpenTerminalTab() {
  const { openTerminal } = useStudioNavigation();
  return useCallback(
    (projectId: string, sessionId: string) => {
      useIdeStore.getState().openTerminal(projectId, sessionId);
      openTerminal(projectId, sessionId);
    },
    [openTerminal],
  );
}

export function useOpenNewTerminal() {
  const openTerminalTab = useOpenTerminalTab();
  const queryClient = useQueryClient();
  return useCallback(
    (projectId: string, cwd?: string) =>
      createTerminal(projectId, cwd).then((session) => {
        void queryClient.invalidateQueries({ queryKey: terminalsQueryKey(projectId) });
        openTerminalTab(projectId, session.id);
        return session;
      }),
    [openTerminalTab, queryClient],
  );
}
