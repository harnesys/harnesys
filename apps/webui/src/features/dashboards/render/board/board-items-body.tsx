import type { WidgetDoc, WidgetItem } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import type { WidgetRuntime } from '../data/use-widget-runtime';
import { type DerivedDefs, ItemContent } from '../item-content';

export interface BoardItemsBodyProps {
  orgId: string;
  doc: WidgetDoc;
  data: Record<string, unknown>;
  runtime: WidgetRuntime;
  editMode: boolean;
  selectedItemId: string | null;
  onSelectItem?: (itemId: string) => void;
}

/** Narrow-container body: primitives flow vertically, each filling its row. */
export function BoardItemsBody({
  orgId,
  doc,
  data,
  runtime,
  editMode,
  selectedItemId,
  onSelectItem,
}: BoardItemsBodyProps): ReactNode {
  const items = doc.items;
  return (
    <div className="flex min-h-0 w-full flex-col gap-1">
      {items.map((item) => (
        <div key={item.id} className="min-h-16 w-full">
          <BoardItemBox
            item={item}
            data={data}
            runtime={runtime}
            orgId={orgId}
            derivedDefs={doc.derived}
            editMode={editMode}
            selected={editMode && selectedItemId === item.id}
            onSelect={onSelectItem}
          />
        </div>
      ))}
    </div>
  );
}

function BoardItemBox({
  item,
  data,
  runtime,
  orgId,
  derivedDefs,
  editMode,
  selected,
  onSelect,
}: {
  item: WidgetItem;
  data: Record<string, unknown>;
  runtime: WidgetRuntime;
  orgId: string;
  derivedDefs: DerivedDefs;
  editMode: boolean;
  selected: boolean;
  onSelect?: (itemId: string) => void;
}): ReactNode {
  const selectHandler = editMode && onSelect ? () => onSelect(item.id) : undefined;
  return (
    // Edit mode turns every item box into a click target for the inspector;
    // nested interactive controls forbid a <button> root, role keeps a11y.
    // biome-ignore lint/a11y/noStaticElementInteractions: role=button is set when clickable
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-lg',
        editMode && 'cursor-pointer border bg-card/60',
        editMode && (selected ? 'border-live' : 'border-live/40 border-dashed'),
      )}
      data-testid={`board-item-${item.id}`}
      data-selected={selected ? 'true' : 'false'}
      role={selectHandler ? 'button' : undefined}
      tabIndex={selectHandler ? 0 : undefined}
      onClick={
        selectHandler
          ? (event) => {
              event.stopPropagation();
              selectHandler();
            }
          : undefined
      }
      onKeyDown={
        selectHandler
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.stopPropagation();
                onSelect?.(item.id);
              }
            }
          : undefined
      }
    >
      {/* Edit mode treats primitives as containers only: the box owns every
            pointer event, so a click inspects instead of pressing a button. */}
      <div className={cn('min-h-0 flex-1 overflow-auto', editMode && 'pointer-events-none')}>
        <ItemContent
          item={item}
          data={data}
          runtime={runtime}
          orgId={orgId}
          derivedDefs={derivedDefs}
          editMode={editMode}
        />
      </div>
    </div>
  );
}
