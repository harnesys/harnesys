import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { dashboardDetailQuery } from '@/features/dashboards/dashboards-queries';
import { WidgetInspector } from '@/features/dashboards/ui/inspector/widget-inspector';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Spinner } from '@/shared/ui/spinner';

/**
 * Right-panel shell around the widget constructor. Mirrors FileInspector /
 * AgentInspector: fixed width driven by the page-level resizer.
 */
export function DashboardInspector({
  width,
  orgId,
  dashboardId,
}: {
  width: number;
  orgId: string;
  dashboardId: string;
}) {
  const detail = useQuery(dashboardDetailQuery(orgId, dashboardId));
  let content: ReactNode;
  if (detail.isPending) {
    content = (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  } else if (detail.data) {
    content = (
      <WidgetInspector orgId={orgId} dashboardId={dashboardId} widgets={detail.data.widgets} />
    );
  } else {
    content = (
      <ScrollArea className="min-h-0 flex-1">
        <p className="px-3 py-3 text-[11px] text-muted-foreground">Dashboard unavailable.</p>
      </ScrollArea>
    );
  }
  return (
    <aside
      className="flex h-svh shrink-0 flex-col self-stretch bg-background"
      style={{ width }}
      data-testid="dashboard-inspector"
    >
      {content}
    </aside>
  );
}
