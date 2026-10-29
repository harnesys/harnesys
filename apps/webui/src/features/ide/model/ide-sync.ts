import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useActiveOrgStore } from '@/entities/org-machine';
import { useDeskStore } from '@/features/desk';
import { terminalsQueryKey, watchDeskEvents } from '@/shared/api';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { useIdeStore } from './ide.store';
import { syncIdeFocus } from './ide-focus-sync';
import { pathForIdeTab } from './open-ide';

export function useIdeSync() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { orgId: urlOrgId, focus } = useStudioLocation();
  const storeOrgId = useActiveOrgStore((state) => state.orgId);
  const org = urlOrgId ?? storeOrgId ?? '';
  const projectId = focus.kind === 'none' || focus.kind === 'settings' ? null : focus.projectId;
  const deskReady = useDeskStore((state) =>
    projectId ? state.hydrated[projectId] === 'ready' : false,
  );
  const focusProjectRef = useRef<string | null>(projectId);
  focusProjectRef.current = projectId;
  useEffect(() => {
    return watchDeskEvents((eventOrgId, event) => {
      if (eventOrgId !== org) {
        return;
      }
      if (event.type !== 'terminal') {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: terminalsQueryKey(event.projectId) });
      useIdeStore.getState().openTerminal(event.projectId, event.jobId);
      if (event.projectId === focusProjectRef.current) {
        void navigate(studioPath.terminal(org, event.projectId, event.jobId));
      }
    });
  }, [queryClient, navigate, org]);
  const activeTabPath = useIdeStore((state) => {
    const tab = state.workspace.activeId
      ? state.workspace.tabs.find((item) => item.id === state.workspace.activeId)
      : null;
    return tab ? pathForIdeTab(org, tab.projectId, tab) : null;
  });
  const restoredPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (focus.kind !== 'none' || !activeTabPath || restoredPathRef.current === activeTabPath) {
      return;
    }
    restoredPathRef.current = activeTabPath;
    void navigate(activeTabPath, { replace: true });
  }, [focus.kind, activeTabPath, navigate]);
  useEffect(() => {
    if (!projectId || !deskReady) {
      return;
    }
    syncIdeFocus({ focus, projectId, org, navigate });
  }, [projectId, focus, deskReady, navigate, org]);
}
export function afterProjectRemoved(
  navigate: (to: string) => void,
  orgId: string,
  projectId: string,
): void {
  useIdeStore.getState().closeProjectTabs(projectId);
  const after = useIdeStore.getState().workspace;
  const active = after.activeId
    ? after.tabs.find((item) => item.id === after.activeId)
    : (after.tabs[after.tabs.length - 1] ?? null);
  if (active) {
    const path = pathForIdeTab(orgId, active.projectId, active);
    if (path) {
      navigate(path);
      return;
    }
  }
  navigate(studioPath.desk(orgId));
}
