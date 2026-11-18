import type { LucideIcon } from 'lucide-react';
import { ListIcon as ListLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/shared/ui/badge';
import { getPath } from '../../data/get-path';
import { withRowBindings } from '../../engine/row-bindings';
import { asArray, asString, asText } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const ListIcon: LucideIcon = ListLucideIcon;

interface ListEntry {
  row: unknown;
  view: unknown;
  index: number;
}

function valueAt(item: unknown, path: string | undefined): unknown {
  if (path === undefined) {
    return undefined;
  }
  const trimmed = path.trim();
  return trimmed === '' ? undefined : getPath(item, trimmed);
}

function displayText(value: unknown): string {
  return asText(value) ?? '';
}

function primaryOf(entry: ListEntry, path: string): string {
  const text = displayText(valueAt(entry.view, path));
  if (text !== '') {
    return text;
  }
  const scalar = displayText(entry.view);
  return scalar !== '' ? scalar : `Item ${entry.index + 1}`;
}

/** Primary/secondary text list with an optional badge per item. */
export function ListPrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const rows = asArray(props.items);
  const bound = withRowBindings(rows, props);
  const entries: ListEntry[] = rows.map((row, index) => ({
    row,
    view: bound[index] ?? row,
    index,
  }));
  const primaryText = asString(props.primaryText)?.trim() || 'title';
  const secondaryText = asString(props.secondaryText)?.trim() || undefined;
  const badgeKey = asString(props.badgeKey)?.trim() || undefined;

  if (entries.length === 0) {
    return <WidgetEmptyState message="List is empty" />;
  }

  return (
    <ul className="flex h-full min-h-0 flex-col gap-1 overflow-auto p-1 text-sm">
      {entries.map((entry) => {
        const primary = primaryOf(entry, primaryText);
        const secondary = displayText(valueAt(entry.view, secondaryText));
        const badge = displayText(valueAt(entry.view, badgeKey));
        return (
          <li key={entry.index} className="shrink-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
              onClick={() => emit('itemClick', { row: entry.row, index: entry.index })}
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{primary}</div>
                {secondary !== '' ? (
                  <div className="truncate text-muted-foreground text-xs">{secondary}</div>
                ) : null}
              </div>
              {badge !== '' ? <Badge variant="secondary">{badge}</Badge> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
