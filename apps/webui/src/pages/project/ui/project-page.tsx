import { PanelRightIcon } from 'lucide-react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { Navigate, useParams } from 'react-router';
import { useDeskStore } from '@/features/desk';
import { useIdeSync, useIdeTabs } from '@/features/ide';
import { useStudioLocation } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Resizer } from '@/shared/ui/resizer';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar';
import { AgentInspector } from '@/widgets/agent-inspector';
import { FileInspector } from '@/widgets/file-inspector';
import { IdeHome } from '@/widgets/ide-home';
import { InboxBell } from '@/widgets/inbox-bell';
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
  const bareProject = Boolean(params.projectId && focus.kind === 'none');
  const showInspector =
    !bareProject &&
    inspectorOpen &&
    activeTab !== null &&
    (activeTab.kind === 'thread' ||
      activeTab.kind === 'file' ||
      activeTab.kind === 'schedule' ||
      activeTab.kind === 'webhook');
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
                <InboxBell />
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
            <AgentInspector width={inspectorWidth} />
          )}
        </>
      ) : null}
    </div>
  );
}
