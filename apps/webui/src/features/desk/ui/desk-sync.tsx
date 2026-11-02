import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAgentStore } from '@/entities/agent';
import { useActiveOrgStore, useOrgActivityStore } from '@/entities/org-machine';
import { useProjects } from '@/entities/project';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { appMetaQuery, listThreads, watchDeskEvents, watchThreadErrors } from '@/shared/api';
import { watchApprovalEvents, watchSourceChanges, watchTerminalEvents } from '@/shared/api/events';
import { sourceFilesTreeQueryKey } from '@/shared/api/files';
import { rememberProjectNode, rememberSelfNode } from '@/shared/api/fleet';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { projectQueryKey } from '@/shared/api/project-base';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { useAgentsDisplayStore } from '../model/agents-display.store';
import { applyDeskEvent } from '../model/apply-desk-event';
import { ensureApprovalChimeUnlock, notifyApprovalRequested } from '../model/approval-chime';
import { useDeskStore } from '../model/desk.store';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { deskTerminalsKey } from '../model/desk-queries';
import { useDeskOrgExtrasSync, useDeskReady, useDeskStoreSync } from '../model/desk-store-sync';
import { refreshThread } from '../model/refresh-thread';
export function DeskSync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId, focus } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const projectId = studioFocusProjectId(focus);
  const activeOrgId = orgId ?? storeOrgId;
  const projectDeskFocus =
    focus.kind === 'thread' ||
    focus.kind === 'spawn' ||
    focus.kind === 'schedule' ||
    focus.kind === 'webhook';
  const deskReadyScope = projectDeskFocus ? projectId : null;
  const projectScopeId =
    projectDeskFocus && projectId && projectId !== activeOrgId ? projectId : null;
  const projectQuery = useProjects();
  const lastSelfNodeRef = useRef<string | null>(null);
  const visibleReady = useDeskReady(deskReadyScope);
  useDeskStoreSync(activeOrgId ?? null, { orgEntities: true });
  useDeskStoreSync(projectScopeId);
  useDeskOrgExtrasSync(activeOrgId ?? null);
  const { data: meta } = useQuery(appMetaQuery(orgId));
  const remoteProjects = useMemo(() => {
    const remote = new Set<string>();
    if (meta?.nodeId && projectQuery.data) {
      for (const item of projectQuery.data) {
        if (item.hostId && item.hostId !== meta.nodeId) {
          remote.add(item.id);
        }
      }
    }
    return remote;
  }, [meta, projectQuery.data]);
  useEffect(() => {
    if (meta?.nodeId) {
      const firstKnown = lastSelfNodeRef.current !== meta.nodeId;
      lastSelfNodeRef.current = meta.nodeId;
      rememberSelfNode(meta.nodeId);
      if (firstKnown) {
        void queryClient.invalidateQueries({ queryKey: ['sources'] });
        void queryClient.invalidateQueries({ queryKey: projectQueryKey });
      }
    }
    if (projectQuery.data) {
      for (const item of projectQuery.data) {
        if (item.hostId) {
          rememberProjectNode(item.id, item.hostId);
        }
      }
    }
  }, [meta, projectQuery.data, queryClient]);
  useLayoutEffect(() => {
    if (!activeOrgId) {
      return;
    }
    void hydrateDeskChrome(activeOrgId).catch(() => {});
  }, [activeOrgId]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    return watchDeskEvents((eventOrgId, event) => {
      if (eventOrgId === activeOrgId) {
        applyDeskEvent(event, { orgId: activeOrgId, navigate });
        return;
      }
      if (event.type === 'run-finish') {
        useOrgActivityStore.getState().bump(eventOrgId, 1);
        return;
      }
      if (event.type === 'thread' && event.thread.unread) {
        useOrgActivityStore.getState().bump(eventOrgId, 1);
      }
    });
  }, [activeOrgId, navigate]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    return watchTerminalEvents((eventOrgId) => {
      if (eventOrgId === activeOrgId) {
        void queryClient.invalidateQueries({ queryKey: deskTerminalsKey });
      }
    });
  }, [activeOrgId, queryClient]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    useOrgActivityStore.getState().clear(activeOrgId);
  }, [activeOrgId]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    return watchThreadErrors((eventOrgId, event) => {
      if (eventOrgId !== activeOrgId) {
        return;
      }
      if (event.type === 'failed') {
        useThreadStore.getState().setLastError(event.threadId, {
          runId: event.runId,
          message: event.message,
          at: event.at,
        });
        useThreadStore.getState().markUnread(event.threadId);
        void refreshThread(event.threadId);
        return;
      }
      if (event.type === 'parked') {
        void refreshThread(event.threadId);
        void syncThreadsFromServer(activeOrgId);
        return;
      }
      if (event.type === 'finished') {
        void refreshThread(event.threadId);
        void syncThreadsFromServer(activeOrgId);
        return;
      }
      if (event.type === 'cleared') {
        useThreadStore.getState().setLastError(event.threadId, null);
        void refreshThread(event.threadId);
        return;
      }
    });
  }, [activeOrgId]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    ensureApprovalChimeUnlock();
    return watchApprovalEvents((eventOrgId, frame) => {
      if (eventOrgId !== activeOrgId) {
        return;
      }
      if (frame.type === 'requested') {
        notifyApprovalRequested(frame.approval.id);
      }
      if (frame.approval.threadId) {
        const force = frame.type !== 'requested';
        void refreshThread(frame.approval.threadId, { force });
      }
    });
  }, [activeOrgId]);
  useEffect(() => {
    if (!activeOrgId) {
      return;
    }
    return watchSourceChanges((frame) => {
      if (frame.orgId !== activeOrgId || remoteProjects.has(frame.sourceId)) {
        return;
      }
      if (frame.event.kind === 'git') {
        void queryClient.invalidateQueries({
          queryKey: gitStatusQueryKey(frame.sourceId),
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: gitFileStatusQueryKey(frame.sourceId),
          exact: false,
        });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: sourceFilesTreeQueryKey(frame.sourceId),
        exact: false,
      });
      void queryClient.invalidateQueries({
        queryKey: ['source-file-content', frame.sourceId],
        exact: false,
      });
      void queryClient.invalidateQueries({
        queryKey: gitFileStatusQueryKey(frame.sourceId),
        exact: false,
      });
    });
  }, [activeOrgId, queryClient, remoteProjects]);
  useEffect(() => {
    if (!projectId || projectQuery.status === 'pending' || !visibleReady) {
      return;
    }
    const hasProject = projectQuery.data?.some((item) => item.id === projectId) ?? false;
    if (!hasProject) {
      return;
    }
    const threads = useThreadStore.getState().items.filter((item) => item.orgId === projectId);
    if (focus.kind === 'thread') {
      const thread = threads.find((item) => item.id === focus.threadId);
      if (!thread) {
        const fallback = fallbackAgentId(projectId);
        if (fallback) {
          revealAgent(fallback);
        }
        void navigate(studioPath.desk(orgId ?? storeOrgId ?? ''), { replace: true });
      }
    }
  }, [
    projectId,
    focus,
    visibleReady,
    projectQuery.status,
    projectQuery.data,
    navigate,
    orgId,
    storeOrgId,
  ]);
  return null;
}

async function syncThreadsFromServer(orgId: string): Promise<void> {
  try {
    const summaries = await listThreads(orgId);
    const store = useThreadStore.getState();
    for (const summary of summaries) {
      const next = toClientThread(summary);
      const current = store.byId(next.id);
      if (current && isEqualThreadState(current, next)) {
        continue;
      }
      store.upsert(next);
    }
  } catch {
    // best-effort refresh; desk hydrate covers the rest
  }
}

function isEqualThreadState(
  a: { updatedAt: string; activeRunId?: string | null; unread: boolean },
  b: { updatedAt: string; activeRunId?: string | null; unread: boolean },
): boolean {
  return a.updatedAt === b.updatedAt && a.activeRunId === b.activeRunId && a.unread === b.unread;
}
function revealAgent(agentId: string): void {
  useAgentsDisplayStore.getState().expand(agentId);
}
function fallbackAgentId(projectId: string): string | null {
  const agents = useAgentStore.getState().items.filter((item) => item.orgId === projectId);
  const known = new Set(agents.map((item) => item.id));
  const focusedThreadId = useDeskStore.getState().focusedThreadId;
  const focusedThread = focusedThreadId
    ? (useThreadStore.getState().byId(focusedThreadId) ?? null)
    : null;
  const candidates = [
    focusedThread?.agentId ?? null,
    focusedThread?.originAgentId ?? null,
    agents.length === 1 ? (agents[0]?.id ?? null) : null,
  ];
  return candidates.find((id) => id && known.has(id)) ?? null;
}
