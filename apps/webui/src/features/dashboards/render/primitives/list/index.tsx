import type { LucideIcon } from 'lucide-react';
import { ListIcon as ListLucideIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Markdown } from '@/shared/ui/markdown';
import { getPath } from '../../data/get-path';
import { withRowBindings } from '../../engine/row-bindings';
import { asArray, asBool, asString, asText } from '../coerce';
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
  const markdown = asBool(props.markdown);
  const dismissible = asBool(props.dismissible);

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
          <li key={entry.index} className="relative shrink-0">
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50',
                dismissible && 'pr-8',
              )}
              onClick={() => emit('itemClick', { row: entry.row, index: entry.index })}
            >
              <div className="min-w-0">
                {markdown ? (
                  <Markdown
                    text={primary}
                    className="px-0 font-medium text-sm [&_blockquote]:my-0 [&_h1]:mt-0 [&_h2]:mt-0 [&_h3]:mt-0 [&_li]:my-0 [&_ol]:my-0 [&_p]:my-0 [&_ul]:my-0"
                  />
                ) : (
                  <div className="truncate font-medium">{primary}</div>
                )}
                {secondary !== '' ? (
                  <div className="truncate text-muted-foreground text-xs">{secondary}</div>
                ) : null}
              </div>
              {badge !== '' ? <Badge variant="secondary">{badge}</Badge> : null}
            </button>
            {dismissible ? (
              <button
                type="button"
                aria-label="Dismiss"
                title="Dismiss"
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => emit('itemDismiss', { row: entry.row, index: entry.index })}
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
