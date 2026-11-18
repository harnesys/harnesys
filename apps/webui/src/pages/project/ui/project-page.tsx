import { useQueryClient } from '@tanstack/react-query';
import { PanelRightIcon } from 'lucide-react';
import { type CSSProperties, type MouseEvent as ReactMouseEvent, useEffect, useRef } from 'react';
import { Navigate, useParams } from 'react-router';
import { DESK_QUERY_KEY, useDeskStore } from '@/features/desk';
import { type IdeTab, useIdeSync, useIdeTabs } from '@/features/ide';
import { ensureStarterBoard } from '@/features/onboarding/model/starter-board';
import { useStudioLocation } from '@/shared/config/location';
import { useStudioNavigation } from '@/shared/config/navigation';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Resizer } from '@/shared/ui/resizer';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AgentInspector } from '@/widgets/agent-inspector';
import { DashboardInspector } from '@/widgets/dashboard-inspector';
import { FileInspector } from '@/widgets/file-inspector';
import { IdeHome } from '@/widgets/ide-home';
import { ProjectSidebar } from '@/widgets/project-sidebar';
import { useInspectorWidth } from '../model/inspector-width';
import { useSidebarWidth } from '../model/sidebar-width';
import { IdeLayoutView } from './ide-layout-view';
export function ProjectPage() {
  const { width: sidebarWidth, dragging: sidebarDragging, onResizeStart } = useSidebarWidth();
  return (
    <SidebarProvider
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      data-sidebar-resizing={sidebarDragging}
      className="h-svh overflow-hidden"
    >
      <ProjectShell onSidebarResizeStart={onResizeStart} />
    </SidebarProvider>
  );
}
function InspectorFallback({
  activeTab,
  orgId,
  width,
}: {
  activeTab: IdeTab;
  orgId: string | null;
  width: number;
}): React.ReactNode {
  if (activeTab.kind === 'dashboard' && orgId) {
    return (
      <DashboardInspector width={width} orgId={orgId} dashboardId={activeTab.dashboardId ?? ''} />
    );
  }
  return <AgentInspector width={width} />;
}

function ProjectShell({
  onSidebarResizeStart,
}: {
  onSidebarResizeStart: (event: ReactMouseEvent) => void;
}) {
  const params = useParams();
  const { orgId, focus } = useStudioLocation();
  const workspace = useIdeTabs();
  const activeTab = workspace.activeId
    ? (workspace.tabs.find((tab) => tab.id === workspace.activeId) ?? null)
    : null;
  const isFileTab = activeTab?.kind === 'file';
  const inspectorOpen = useDeskStore((state) => state.inspectorOpen);
  const { width: inspectorWidth, dragging, shellRef, onResizeStart } = useInspectorWidth();
  useIdeSync();
  const queryClient = useQueryClient();
  const { openBoard } = useStudioNavigation();
  const seededOrg = useRef<string | null>(null);
  useEffect(() => {
    if (!orgId || seededOrg.current === orgId) {
      return;
    }
    seededOrg.current = orgId;
    void ensureStarterBoard(orgId)
      .then((result) => {
        if (!result) {
          return;
        }
        void queryClient.invalidateQueries({ queryKey: DESK_QUERY_KEY });
        if (result.created) {
          openBoard(result.boardId);
        }
      })
      .catch(() => undefined);
  }, [orgId, openBoard, queryClient]);
  const bareProject = Boolean(params.projectId && focus.kind === 'none');
  const showInspector =
    !bareProject &&
    activeTab !== null &&
    inspectorOpen &&
    (activeTab.kind === 'thread' || activeTab.kind === 'file' || activeTab.kind === 'dashboard');
  const hasTabs = workspace.tabs.length > 0;
  if (bareProject) {
    return <Navigate to={orgId ? studioPath.desk(orgId) : '/'} replace />;
  }
  return (
    <div ref={shellRef} className="flex min-h-svh w-full" data-testid="project-shell">
      <ProjectSidebar onResizeStart={onSidebarResizeStart} />
      <SidebarInset className="min-w-0 bg-background">
        {hasTabs ? (
          <div className="flex min-h-0 min-w-0 flex-1">
            <IdeLayoutView />
          </div>
        ) : (
          <>
            <div className="flex h-11 shrink-0 items-center gap-2 px-3">
              <SidebarTrigger />
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid="toggle-inspector"
                  title={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                  aria-pressed={inspectorOpen}
                  disabled
                  className={cn(inspectorOpen && 'bg-muted text-foreground')}
                  onClick={() => useDeskStore.getState().toggleInspector()}
                >
                  <PanelRightIcon />
                  <span className="sr-only">
                    {inspectorOpen ? 'Hide inspector' : 'Show inspector'}
                  </span>
                </Button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col" data-testid="empty-desk">
              <IdeHome />
            </div>
          </>
        )}
      </SidebarInset>
      {showInspector && activeTab ? (
        <>
          <Resizer
            label="Resize inspector"
            testId="inspector-split-resize"
            dragging={dragging}
            onResizeStart={onResizeStart}
          />
          {isFileTab && activeTab.path ? (
            <FileInspector
              width={inspectorWidth}
              file={{
                path: activeTab.path,
                dirty: Boolean(activeTab.dirty),
                projectId: activeTab.projectId,
              }}
            />
          ) : (
            <InspectorFallback activeTab={activeTab} orgId={orgId} width={inspectorWidth} />
          )}
        </>
      ) : null}
    </div>
  );
}
