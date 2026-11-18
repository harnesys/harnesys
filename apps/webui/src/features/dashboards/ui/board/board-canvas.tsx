import {
  type DashboardDetail,
  type DashboardWidget,
  type LayoutBatchItem,
  type PrimitiveId,
  primitiveById,
  type WidgetDoc,
  type WidgetItem,
} from '@harnesys/contracts';
import { type ReactNode, useEffect, useState } from 'react';
import { WidgetRenderer } from '@/features/dashboards/render/widget-renderer';
import { Button } from '@/shared/ui/button';
import { useDashboardInspectorStore } from '../../model/inspector-store';
import { defaultWidgetItem } from '../../model/widget-form';
import type { GridEntry, GridRect } from '../../render/grid/grid-math';
import { authoredWidth, sameEntries } from '../../render/grid/grid-math';
import { SlotGrid } from '../../render/grid/slot-grid';
import { useElementSize } from '../../render/grid/use-element-size';
import { useDraftSelectionGuard } from '../draft-guard';
import { WidgetShell } from '../widget-shell';

interface BoardCanvasProps {
  dashboard: DashboardDetail;
  /** Per-widget refresh counters; a higher value refetches that widget's sources. */
  refreshTokens: Record<string, number>;
  onCommitLayout: (items: LayoutBatchItem[]) => void;
  onRemove: (widgetId: string) => void;
  onActivate: (widgetId: string) => void;
  onRefresh: (widgetId: string) => void;
  onAddWidget: () => void;
  onDuplicate: (widget: DashboardWidget) => void;
  onImport: (widgetId: string, doc: WidgetDoc) => void;
  /** Item slot changes inside a widget (inner grid drag/resize stop), buffered as a draft. */
  onCommitItems: (widgetId: string, items: WidgetItem[]) => void;
}

const MOBILE_STACK_MAX_WIDTH = 640;
const BOARD_REFERENCE_WIDTH = 1200;
const COMPOSITE_MIN_W = 192;
const COMPOSITE_MIN_H = 160;
const WIDGET_MIN_W = 96;
const WIDGET_MIN_H = 80;

function toEntry(widget: DashboardWidget): GridEntry {
  const layout = primitiveById(widget.doc.primitive)?.layout;
  const composite = widget.doc.items.length > 0;
  return {
    id: widget.id,
    rect: widget.rect,
    minW: composite ? COMPOSITE_MIN_W : Math.max((layout?.minW ?? 1) * 96, WIDGET_MIN_W),
    minH: composite ? COMPOSITE_MIN_H : Math.max((layout?.minH ?? 1) * 80, WIDGET_MIN_H),
  };
}

function toBatch(entries: Array<{ id: string; rect: GridRect }>): LayoutBatchItem[] {
  return entries.map((entry) => ({ widgetId: entry.id, rect: entry.rect }));
}

/**
 * Dashboard board: widgets on the outer pixel grid with drag/resize in edit
 * mode only; view mode is static and primitives stay interactive. Narrow
 * containers stack widgets vertically and primitives within them.
 */
export function BoardCanvas({
  dashboard,
  refreshTokens,
  onCommitLayout,
  onRemove,
  onActivate,
  onRefresh,
  onAddWidget,
  onDuplicate,
  onImport,
  onCommitItems,
}: BoardCanvasProps) {
  const { ref: measureRef, width } = useElementSize<HTMLDivElement>();
  const [layout, setLayout] = useState<GridEntry[]>(() =>
    dashboard.widgets.map((widget) => toEntry(widget)),
  );
  const editMode = useDashboardInspectorStore((state) =>
    state.dashboardId === dashboard.id ? state.editMode : false,
  );
  const selectedWidgetId = useDashboardInspectorStore((state) =>
    state.dashboardId === dashboard.id ? state.selectedWidgetId : null,
  );
  const selectedItemId = useDashboardInspectorStore((state) =>
    state.dashboardId === dashboard.id ? state.selectedItemId : null,
  );
  const drafts = useDashboardInspectorStore((state) => state.drafts);
  const setDraft = useDashboardInspectorStore((state) => state.setDraft);
  const selectWidgetItem = useDashboardInspectorStore((state) => state.selectWidgetItem);
  const clearSelection = useDashboardInspectorStore((state) => state.clearSelection);
  const guard = useDraftSelectionGuard(dashboard.widgets);
  const stacked = width > 0 && width < MOBILE_STACK_MAX_WIDTH;
  // Authored width comes from the committed layout, never from the live one:
  // a fixed reference keeps the pointer-to-grid mapping stable mid-drag.
  const referenceWidth = authoredWidth(
    dashboard.widgets.map((widget) => ({ id: widget.id, rect: widget.rect })),
    BOARD_REFERENCE_WIDTH,
  );

  // Resync from the server only when committed slots actually differ from the
  // current grid state, so an unrelated refetch never clobbers a live drag.
  useEffect(() => {
    setLayout((current) => {
      const committed = dashboard.widgets.map((widget) => toEntry(widget));
      return sameEntries(current, committed) ? current : committed;
    });
  }, [dashboard.widgets]);

  const appendItem = (widget: DashboardWidget, primitive: PrimitiveId): void => {
    const doc = drafts[widget.id]?.doc ?? widget.doc;
    const item = defaultWidgetItem(primitive, doc.items);
    setDraft(widget.id, { ...doc, items: [...doc.items, item] }, widget.updatedAt);
    selectWidgetItem(dashboard.id, widget.id, item.id);
  };

  const commitLayout = (next: Array<{ id: string; rect: GridRect }>): void => {
    setLayout((current) => {
      const rects = new Map(next.map((entry) => [entry.id, entry.rect]));
      return current.map((entry) => {
        const rect = rects.get(entry.id);
        return rect ? { ...entry, rect } : entry;
      });
    });
    onCommitLayout(toBatch(next));
  };

  const widgetCard = (widget: DashboardWidget, variant: 'grid' | 'stack'): ReactNode => (
    <BoardWidgetCard
      widget={widget}
      dashboard={dashboard}
      drafts={drafts}
      refreshTokens={refreshTokens}
      editMode={editMode}
      selected={editMode && selectedWidgetId === widget.id}
      bodyVariant={variant}
      onSelect={(widgetId) => guard.requestSelect(dashboard.id, widgetId)}
      onSelectItem={selectWidgetItem}
      onRemove={onRemove}
      onActivate={onActivate}
      onRefresh={onRefresh}
      onAddPrimitive={(primitive) => appendItem(widget, primitive)}
      onDuplicate={onDuplicate}
      onImport={onImport}
      onCommitItems={(items) => onCommitItems(widget.id, items)}
    />
  );

  const emptyState =
    dashboard.widgets.length === 0 ? (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-10 py-12 text-muted-foreground">
          <p className="text-sm">This dashboard is empty</p>
          <Button
            variant="outline"
            size="sm"
            onClick={onAddWidget}
            data-testid="dashboards-empty-add"
          >
            Add widget
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div ref={measureRef} className="flex min-h-0 flex-1 flex-col">
      {emptyState}
      {dashboard.widgets.length > 0 && !stacked ? (
        <SlotGrid
          className="min-h-0 flex-1 p-4"
          entries={layout}
          referenceWidth={referenceWidth}
          editable={editMode}
          selectedId={editMode && selectedItemId === null ? selectedWidgetId : null}
          hoverEnabled={selectedItemId === null}
          handlesOnHover={false}
          dragHandleSelector=".dashboard-widget-drag-handle"
          variant="plain"
          onBackgroundClick={editMode ? clearSelection : undefined}
          onCommit={commitLayout}
          renderItem={(entry) => {
            const widget = dashboard.widgets.find((candidate) => candidate.id === entry.id);
            return widget ? widgetCard(widget, 'grid') : null;
          }}
        />
      ) : null}
      {dashboard.widgets.length > 0 && stacked ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            {dashboard.widgets.map((widget) => (
              <div key={widget.id} className="flex min-h-24 w-full flex-col">
                {widgetCard(widget, 'stack')}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {guard.dialog}
    </div>
  );
}

interface BoardWidgetCardProps {
  widget: DashboardWidget;
  dashboard: DashboardDetail;
  drafts: Record<string, { doc: WidgetDoc }>;
  refreshTokens: Record<string, number>;
  editMode: boolean;
  selected: boolean;
  bodyVariant: 'grid' | 'stack';
  onSelect: (widgetId: string) => void;
  onSelectItem: (dashboardId: string, widgetId: string, itemId: string) => void;
  onRemove: (widgetId: string) => void;
  onActivate: (widgetId: string) => void;
  onRefresh: (widgetId: string) => void;
  onAddPrimitive: (primitive: PrimitiveId) => void;
  onDuplicate: (widget: DashboardWidget) => void;
  onImport: (widgetId: string, doc: WidgetDoc) => void;
  onCommitItems: (items: WidgetItem[]) => void;
}

/** One widget card: chrome from WidgetShell, engine from WidgetRenderer. */
function BoardWidgetCard({
  widget,
  dashboard,
  drafts,
  refreshTokens,
  editMode,
  selected,
  bodyVariant,
  onSelect,
  onSelectItem,
  onRemove,
  onActivate,
  onRefresh,
  onAddPrimitive,
  onDuplicate,
  onImport,
  onCommitItems,
}: BoardWidgetCardProps) {
  const doc = drafts[widget.id]?.doc ?? widget.doc;
  const selectedItemId = useDashboardInspectorStore((state) => state.selectedItemId);
  return (
    <WidgetShell
      widget={{ ...widget, doc }}
      editMode={editMode}
      selected={selected}
      highlighted={selected && selectedItemId === null}
      onSelect={onSelect}
      onRemove={onRemove}
      onActivate={onActivate}
      onRefresh={onRefresh}
      onAddPrimitive={onAddPrimitive}
      onDuplicate={onDuplicate}
      onImport={onImport}
    >
      <WidgetRenderer
        orgId={dashboard.orgId}
        dashboardId={dashboard.id}
        widgetId={widget.id}
        doc={doc}
        refreshSignal={refreshTokens[widget.id] ?? 0}
        editMode={editMode}
        selectedItemId={selected ? selectedItemId : null}
        onSelectItem={(itemId) => onSelectItem(dashboard.id, widget.id, itemId)}
        onItemsLayoutChange={onCommitItems}
        bodyVariant={bodyVariant}
      />
    </WidgetShell>
  );
}
