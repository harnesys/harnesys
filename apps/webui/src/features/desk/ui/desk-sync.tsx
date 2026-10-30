import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAgentStore } from '@/entities/agent';
import { useActiveOrgStore, useOrgActivityStore } from '@/entities/org-machine';
import { useProjects } from '@/entities/project';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { appMetaQuery, listThreads, watchDeskEvents, watchThreadErrors } from '@/shared/api';
import { projectQueryKey } from '@/shared/api/project-base';
import { watchApprovalEvents, watchSourceChanges } from '@/shared/api/events';
import { sourceFilesTreeQueryKey } from '@/shared/api/files';
import { rememberProjectNode, rememberSelfNode } from '@/shared/api/fleet';
import { gitFileStatusQueryKey, gitOrgSummaryQueryKey, gitStatusQueryKey } from '@/shared/api/git';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { useAgentsDisplayStore } from '../model/agents-display.store';
import { applyDeskEvent } from '../model/apply-desk-event';
import { ensureApprovalChimeUnlock, notifyApprovalRequested } from '../model/approval-chime';
import { useDeskStore } from '../model/desk.store';
import { hydrateDeskChrome } from '../model/desk-chrome';
import { hydrateDesk } from '../model/hydrate-desk';
import { refreshThread } from '../model/refresh-thread';
export function DeskSync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId, focus } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const projectId = studioFocusProjectId(focus);
  const projectQuery = useProjects();
  const lastSelfNodeRef = useRef<string | null>(null);
  const projectIds = useMemo(
    () => projectQuery.data?.map((item) => item.id) ?? [],
    [projectQuery.data],
  );
  const visibleReady = useDeskStore((state) =>
    projectId ? state.hydrated[projectId] === 'ready' : false,
  );
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
    const activeOrgId = orgId ?? storeOrgId;
    if (!activeOrgId) {
      return;
    }
    void hydrateDeskChrome(activeOrgId).catch(() => {});
    void hydrateDesk(activeOrgId).catch(() => {});
    if (projectId && projectId !== activeOrgId) {
      void hydrateDesk(projectId).catch(() => {});
    }
  }, [projectId, orgId, storeOrgId]);
  useEffect(() => {
    if (projectQuery.status !== 'success') {
      return;
    }
    const known = new Set(projectIds);
    if (orgId) {
      known.add(orgId);
    }
    for (const id of Object.keys(useDeskStore.getState().hydrated)) {
      if (!known.has(id)) {
        useDeskStore.getState().setHydrateStatus(id, null);
      }
    }
    // File trees load on demand when their explorer section mounts
    // (staleTime 60s each) instead of all at boot competing with desk slices.
  }, [projectIds, projectQuery.status, orgId]);
  useEffect(() => {
    const activeOrgId = orgId ?? storeOrgId;
    if (!activeOrgId) {
      return;
    }
    return watchDeskEvents((eventOrgId, event) => {
      if (eventOrgId === activeOrgId) {
        applyDeskEvent(event);
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
  }, [orgId, storeOrgId]);
  useEffect(() => {
    const activeOrgId = orgId ?? storeOrgId;
    if (!activeOrgId) {
      return;
    }
    useOrgActivityStore.getState().clear(activeOrgId);
  }, [orgId, storeOrgId]);
  useEffect(() => {
    const activeOrgId = orgId ?? storeOrgId;
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
  }, [orgId, storeOrgId]);
  useEffect(() => {
    const activeOrgId = orgId ?? storeOrgId;
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
  }, [orgId, storeOrgId]);
  useEffect(() => {
    const activeOrgId = orgId ?? storeOrgId;
    if (!activeOrgId) {
      return;
    }
    return watchSourceChanges((frame) => {
      if (frame.orgId !== activeOrgId || remoteProjects.has(frame.sourceId)) {
        return;
      }
      if (frame.event.kind === 'git') {
        void queryClient.invalidateQueries({ queryKey: gitStatusQueryKey(frame.sourceId) });
        void queryClient.invalidateQueries({
          queryKey: gitFileStatusQueryKey(frame.sourceId),
        });
        void queryClient.invalidateQueries({ queryKey: gitOrgSummaryQueryKey(activeOrgId) });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(frame.sourceId) });
      void queryClient.invalidateQueries({
        queryKey: ['source-file-content', frame.sourceId],
      });
      void queryClient.invalidateQueries({ queryKey: gitFileStatusQueryKey(frame.sourceId) });
      void queryClient.invalidateQueries({ queryKey: gitOrgSummaryQueryKey(activeOrgId) });
    });
  }, [orgId, storeOrgId, queryClient, remoteProjects]);
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
