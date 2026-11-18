import { useQuery } from '@tanstack/react-query';
import { CogIcon, PlusIcon } from 'lucide-react';
import { useNavigate } from 'react-router';
import { dashboardsListQuery } from '@/features/dashboards/dashboards-queries';
import { resolveDashboardIcon } from '@/features/dashboards/model/dashboard-icons';
import {
  openDashboardCreateDialog,
  openDashboardSettingsDialog,
} from '@/features/dashboards/ui/dashboard-settings-dialog';
import { useIdeStore } from '@/features/ide';
import { useOrgId } from '@/shared/config/location';
import { studioPath } from '@/shared/config/routes';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { SidebarEmpty } from './sidebar-empty';

export function DashboardsSection({ onSelectDone }: { onSelectDone: () => void }) {
  const orgId = useOrgId() ?? '';
  const navigate = useNavigate();
  const listQuery = useQuery(dashboardsListQuery(orgId));

  const startCreation = (): void => {
    if (!orgId) {
      return;
    }
    void openDashboardCreateDialog().then((result) => {
      if (result?.action === 'created') {
        void navigate(studioPath.dashboard(orgId, result.dashboardId));
        onSelectDone();
      }
    });
  };

  const openSettings = (
    dashboardId: string,
    initial: { name: string; color: string | null; icon: string },
  ): void => {
    void openDashboardSettingsDialog(dashboardId, initial).then((result) => {
      if (result?.action === 'removed') {
        useIdeStore.getState().closeByEntity(orgId, 'dashboard', dashboardId);
      }
    });
  };

  if (listQuery.isError) {
    return <SidebarEmpty title="Failed to load dashboards" testId="dashboards-error" />;
  }
  if (listQuery.isPending) {
    return (
      <div className="flex flex-col gap-1 px-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (listQuery.data.length === 0) {
    return (
      <SidebarEmpty title="No dashboards yet" onAction={startCreation} testId="dashboards-empty" />
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {listQuery.data.map((dashboard) => (
        <DashboardRow
          key={dashboard.id}
          dashboardId={dashboard.id}
          name={dashboard.name}
          icon={dashboard.icon}
          color={dashboard.color}
          widgetCount={dashboard.widgetCount}
          selected={false}
          onSelect={() => {
            void navigate(studioPath.dashboard(orgId, dashboard.id));
            onSelectDone();
          }}
          onSettings={() =>
            openSettings(dashboard.id, {
              name: dashboard.name,
              color: dashboard.color,
              icon: dashboard.icon,
            })
          }
        />
      ))}
      <span className="sr-only" data-dashboard-count={listQuery.data.length} />
    </div>
  );
}

export function DashboardsSectionActions() {
  const orgId = useOrgId() ?? '';
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-testid="dashboards-create"
      title="New dashboard"
      onClick={() =>
        void openDashboardCreateDialog().then((result) => {
          if (result?.action === 'created') {
            void navigate(studioPath.dashboard(orgId, result.dashboardId));
          }
        })
      }
    >
      <PlusIcon className="size-3.5 text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
      <span className="sr-only">New dashboard</span>
    </Button>
  );
}

function DashboardRow({
  dashboardId,
  name,
  icon,
  color,
  widgetCount,
  selected,
  onSelect,
  onSettings,
}: {
  dashboardId: string;
  name: string;
  icon: string;
  color: string | null;
  widgetCount: number;
  selected: boolean;
  onSelect: () => void;
  onSettings: () => void;
}) {
  const DashboardIcon = resolveDashboardIcon(icon);
  return (
    <div
      className={cn(
        'group/dashboard relative flex items-start rounded-md transition-colors hover:bg-sidebar-accent/70',
        selected && 'bg-sidebar-accent/70 text-sidebar-accent-foreground',
      )}
      data-testid={`dashboard-${dashboardId}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
        onClick={onSelect}
      >
        <span
          className={cn(
            'relative mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md',
            entityColorTintClass(color),
          )}
          style={entityColorTintStyle(color)}
        >
          <DashboardIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm leading-4">{name}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground leading-4">
            {widgetCount} {widgetCount === 1 ? 'widget' : 'widgets'}
          </span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1 right-1 opacity-0 group-hover/dashboard:opacity-100"
        title="Configure dashboard"
        data-testid={`dashboard-config-${dashboardId}`}
        onClick={(event) => {
          event.stopPropagation();
          onSettings();
        }}
      >
        <CogIcon className="text-sidebar-foreground/50 group-hover/button:text-sidebar-foreground" />
        <span className="sr-only">Configure dashboard</span>
      </Button>
    </div>
  );
}
