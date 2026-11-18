import type { LayoutBatchItem, WidgetDoc, WidgetItem, WidgetTemplate } from '@harnesys/contracts';
import { materializeWidgetTemplate } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  dashboardDetailQuery,
  useActivateDashboardWidget,
  useAddDashboardWidget,
  useDashboardsChangedSync,
  useDeleteDashboardWidget,
  useUpdateDashboardLayout,
  useUpdateDashboardWidget,
} from '@/features/dashboards/dashboards-queries';
import {
  dirtyDraftIds,
  useDashboardInspectorStore,
} from '@/features/dashboards/model/inspector-store';
import { entityColorTintClass, entityColorTintStyle } from '@/shared/lib/entity-colors';
import { Button } from '@/shared/ui/button';
import { PageHeader, PageHeaderIcon } from '@/shared/ui/page-header';
import { Spinner } from '@/shared/ui/spinner';
import { toast } from '@/shared/ui/toast';
import { resolveDashboardIcon } from '../model/dashboard-icons';
import { BoardCanvas } from './board/board-canvas';
import { WidgetTemplateGallery } from './widget-template-gallery';

export function DashboardSurface({ orgId, dashboardId }: { orgId: string; dashboardId: string }) {
  useDashboardsChangedSync(orgId);
  const detailQuery = useQuery(dashboardDetailQuery(orgId, dashboardId));
  const [refreshTokens, setRefreshTokens] = useState<Record<string, number>>({});
  const updateLayout = useUpdateDashboardLayout(orgId, dashboardId);
  const addWidget = useAddDashboardWidget(orgId, dashboardId);
  const deleteWidget = useDeleteDashboardWidget(orgId, dashboardId);
  const activateWidget = useActivateDashboardWidget(orgId, dashboardId);
  const editMode = useDashboardInspectorStore((state) =>
    state.dashboardId === dashboardId ? state.editMode : false,
  );
  const setEditMode = useDashboardInspectorStore((state) => state.setEditMode);
  const selectWidget = useDashboardInspectorStore((state) => state.selectWidget);
  const clearDraft = useDashboardInspectorStore((state) => state.clearDraft);
  const clearSelection = useDashboardInspectorStore((state) => state.clearSelection);
  const drafts = useDashboardInspectorStore((state) => state.drafts);
  const setDraft = useDashboardInspectorStore((state) => state.setDraft);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const widgets = detailQuery.data?.widgets ?? [];
  const hasDirtyDrafts = dirtyDraftIds(drafts, widgets).length > 0;
  const updateWidget = useUpdateDashboardWidget(orgId, dashboardId);

  /** Done exits edit mode and flushes every dirty draft to the server. */
  const finishEditing = async (): Promise<void> => {
    setEditMode(dashboardId, false);
    const dirty = dirtyDraftIds(drafts, widgets);
    if (dirty.length === 0) {
      return;
    }
    try {
      await Promise.all(
        dirty.map((widgetId) =>
          updateWidget.mutateAsync({
            widgetId,
            body: { doc: drafts[widgetId].doc },
            baseUpdatedAt: drafts[widgetId].baseUpdatedAt,
          }),
        ),
      );
      for (const widgetId of dirty) {
        clearDraft(widgetId);
      }
      toast.add({ title: 'Dashboard saved', type: 'success' });
    } catch {
      toast.add({ title: 'Some widgets failed to save', type: 'error' });
    }
  };

  // Selection is per-surface state and resets when the tab closes; buffered
  // drafts survive tab switches so switching never destroys unsaved work.
  useEffect(() => clearSelection, [clearSelection]);

  useEffect(() => {
    if (!hasDirtyDrafts) {
      return;
    }
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDirtyDrafts]);

  if (detailQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-destructive text-sm">
          {detailQuery.error instanceof Error
            ? detailQuery.error.message
            : 'Failed to load dashboard'}
        </p>
      </div>
    );
  }

  const dashboard = detailQuery.data;
  const DashboardIcon = resolveDashboardIcon(dashboard.icon);
  const nextY = dashboard.widgets.reduce(
    (max, widget) => Math.max(max, widget.rect.y + widget.rect.h),
    0,
  );

  const addTemplate = (template: WidgetTemplate): void => {
    setGalleryOpen(false);
    addWidget.mutate(
      {
        rect: { ...template.rect, y: nextY },
        doc: materializeWidgetTemplate(template, orgId),
      },
      { onSuccess: (result) => selectWidget(dashboard.id, result.widgetId) },
    );
  };

  const duplicateWidget = (widget: (typeof widgets)[number]): void => {
    addWidget.mutate(
      {
        rect: { ...widget.rect, y: nextY },
        doc: { ...widget.doc, title: `${widget.doc.title} copy`.slice(0, 120) },
      },
      { onSuccess: (result) => selectWidget(dashboard.id, result.widgetId) },
    );
  };

  const importWidget = (widgetId: string, doc: WidgetDoc): void => {
    const widget = widgets.find((candidate) => candidate.id === widgetId);
    if (!widget) {
      return;
    }
    setDraft(widgetId, doc, widget.updatedAt);
    selectWidget(dashboard.id, widgetId);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="ide-dashboard">
      <PageHeader
        icon={
          <PageHeaderIcon
            className={entityColorTintClass(dashboard.color)}
            style={entityColorTintStyle(dashboard.color)}
          >
            <DashboardIcon className="size-4" />
          </PageHeaderIcon>
        }
        title={dashboard.name}
        badge={
          dashboard.widgets.some((widget) => widget.status === 'draft') ? (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">
              Draft widgets
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setGalleryOpen(true)}
              disabled={addWidget.isPending}
              data-testid="dashboards-add-widget"
            >
              <PlusIcon /> Add widget
            </Button>
            <Button
              variant={editMode ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={editMode}
              title={editMode ? 'Save and finish editing' : 'Edit widgets'}
              onClick={() => {
                if (editMode) {
                  void finishEditing();
                } else {
                  setEditMode(dashboardId, true);
                }
              }}
              data-testid="dashboards-edit-mode"
            >
              <PencilIcon /> {editMode ? 'Done' : 'Edit'}
            </Button>
          </>
        }
      />
      <BoardCanvas
        dashboard={dashboard}
        refreshTokens={refreshTokens}
        onCommitLayout={(items: LayoutBatchItem[]) => updateLayout.mutate({ items })}
        onRemove={(widgetId) => deleteWidget.mutate(widgetId)}
        onActivate={(widgetId) => activateWidget.mutate(widgetId)}
        onRefresh={(widgetId) => {
          setRefreshTokens((prev) => ({ ...prev, [widgetId]: (prev[widgetId] ?? 0) + 1 }));
          toast.add({ title: 'Refreshing widget sources', type: 'info' });
        }}
        onAddWidget={() => setGalleryOpen(true)}
        onDuplicate={duplicateWidget}
        onImport={importWidget}
        onCommitItems={(widgetId: string, items: WidgetItem[]) => {
          const widget = widgets.find((candidate) => candidate.id === widgetId);
          if (!widget) {
            return;
          }
          const doc = drafts[widgetId]?.doc ?? widget.doc;
          setDraft(widgetId, { ...doc, items }, widget.updatedAt);
        }}
      />
      <WidgetTemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        onPick={addTemplate}
      />
    </div>
  );
}
