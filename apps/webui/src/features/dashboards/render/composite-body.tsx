import type { WidgetDoc, WidgetItem } from '@harnesys/contracts';
import { primitiveById } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { WidgetRuntime } from './data/use-widget-runtime';
import { authoredWidth, type GridEntry, type GridRect } from './grid/grid-math';
import { SlotGrid } from './grid/slot-grid';
import { ItemContent } from './item-content';

const ITEM_UNIT = 32;

export interface CompositeBodyProps {
  orgId: string;
  doc: WidgetDoc;
  data: Record<string, unknown>;
  runtime: WidgetRuntime;
  editMode: boolean;
  selectedItemId: string | null;
  onSelectItem?: (itemId: string) => void;
  onItemsLayoutChange?: (items: WidgetItem[]) => void;
}

function itemEntry(item: WidgetItem): GridEntry {
  const layout = primitiveById(item.primitive)?.layout;
  return {
    id: item.id,
    rect: item.rect,
    minW: (layout?.minW ?? 1) * ITEM_UNIT,
    minH: (layout?.minH ?? 1) * ITEM_UNIT,
  };
}

function itemLabel(item: WidgetItem): string {
  return item.title ?? primitiveById(item.primitive)?.title ?? item.id;
}

/**
 * Composite render: primitives arranged on the widget's internal 12-column
 * subgrid. Edit mode turns every box into a selectable drag/resize slot; view
 * mode keeps the grid static and the primitives interactive.
 */
export function CompositeBody(props: CompositeBodyProps): ReactNode {
  const { orgId, doc, data, runtime, editMode, selectedItemId, onSelectItem, onItemsLayoutChange } =
    props;

  const commit = (next: Array<{ id: string; rect: GridRect }>): void => {
    const rects = new Map(next.map((entry) => [entry.id, entry.rect]));
    onItemsLayoutChange?.(
      doc.items.map((item) => {
        const rect = rects.get(item.id);
        return rect ? { ...item, rect } : item;
      }),
    );
  };

  const entries = doc.items.map(itemEntry);

  return (
    <SlotGrid
      className="h-full flex-1"
      entries={entries}
      referenceWidth={authoredWidth(entries, ITEM_UNIT * 12)}
      editable={editMode}
      selectedId={selectedItemId}
      variant="card"
      onSelect={editMode ? onSelectItem : undefined}
      onCommit={commit}
      label={(entry) => {
        const item = doc.items.find((candidate) => candidate.id === entry.id);
        return item ? itemLabel(item) : entry.id;
      }}
      renderItem={(entry) => {
        const item = doc.items.find((candidate) => candidate.id === entry.id);
        if (!item) {
          return null;
        }
        return (
          <div className={cn('h-full w-full', editMode && 'pointer-events-none select-none')}>
            <ItemContent
              item={item}
              data={data}
              runtime={runtime}
              orgId={orgId}
              derivedDefs={doc.derived}
              editMode={editMode}
            />
          </div>
        );
      }}
    />
  );
}
