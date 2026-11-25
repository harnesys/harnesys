import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { deskTerminalsKey, useDeskStore } from '@/features/desk';
import { type FileRef, fileRefProjectId } from '@/features/open-file';
import { getActiveOrgId } from '@/shared/api/active-org';
import { createTerminal } from '@/shared/api/terminals';
import { useOrgId } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import type { IdeTab } from './ide.store';
import { useIdeStore } from './ide.store';

export function pathForIdeTab(orgId: string, projectId: string, tab: IdeTab): string | null {
  if (tab.kind === 'thread' && tab.threadId) {
    return studioPath.thread(orgId, projectId, tab.threadId);
  }
  if (tab.kind === 'file' && tab.target) {
    return pathForFileRef(orgId, tab.target, projectId);
  }
  if (tab.kind === 'diff' && tab.path) {
    return studioPath.diff(orgId, projectId, tab.path);
  }
  if (tab.kind === 'board' && tab.boardId) {
    return studioPath.board(orgId, tab.boardId);
  }
  if (tab.kind === 'dashboard' && tab.dashboardId) {
    return studioPath.dashboard(orgId, tab.dashboardId);
  }
  if (tab.kind === 'spawn' && tab.threadId && tab.spawnId) {
    return studioPath.spawn(orgId, projectId, tab.threadId, tab.spawnId);
  }
  if (tab.kind === 'terminal' && tab.terminalSessionId) {
    return studioPath.terminal(orgId, projectId, tab.terminalSessionId);
  }
  return null;
}

export function pathForFileRef(
  orgId: string,
  target: FileRef,
  fallbackProjectId: string,
): string | null {
  if (target.source === 'project') {
    if (target.worktreeId) {
      return null;
    }
    return studioPath.file(orgId, target.projectId, target.path);
  }
  if (target.source === 'issue-attachment') {
    return studioPath.attachment(
      orgId,
      fileRefProjectId(target, fallbackProjectId),
      target.issueId,
      target.attachmentId,
    );
  }
  return null;
}

export function openFile(target: FileRef): void {
  useIdeStore.getState().openFile(target);
}

export function useOpenFile() {
  const navigate = useNavigate();
  const orgId = useOrgId() ?? '';
  return useCallback(
    (target: FileRef, fallbackProjectId?: string) => {
      useIdeStore.getState().openFile(target);
      const projectId = fileRefProjectId(target, fallbackProjectId ?? getActiveOrgId() ?? '');
      const path = pathForFileRef(orgId, target, projectId);
      if (path) {
        void navigate(path);
      }
    },
    [navigate, orgId],
  );
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
    (
      projectId: string,
      agentId: string,
      threadId: string,
      spawnId: string,
      spawnAgentId?: string,
    ) => {
      useIdeStore.getState().openSpawn(projectId, agentId, threadId, spawnId, spawnAgentId);
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
        void queryClient.invalidateQueries({ queryKey: deskTerminalsKey });
        openTerminalTab(projectId, session.id);
        return session;
      }),
    [openTerminalTab, queryClient],
  );
}
