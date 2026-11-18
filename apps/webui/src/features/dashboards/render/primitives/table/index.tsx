import type { LucideIcon } from 'lucide-react';
import { TableIcon as TableLucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { withRowBindings } from '../../engine/row-bindings';
import { asArray, asBool, asNumber, asNumeric, asRecord, asRecordArray } from '../coerce';
import type { PrimitiveComponentProps } from '../primitive-props';
import { WidgetEmptyState } from '../states';

export const TableIcon: LucideIcon = TableLucideIcon;

export type TableColumnFormat = 'text' | 'number' | 'date' | 'badge' | 'link';

const COLUMN_FORMATS: readonly TableColumnFormat[] = ['text', 'number', 'date', 'badge', 'link'];
const MAX_ROWS = 5000;

export interface TableColumn {
  key: string;
  label: string;
  format: TableColumnFormat;
}

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: string;
  direction: SortDirection;
}

interface TableRowEntry {
  row: Record<string, unknown>;
  cells: Record<string, unknown>;
  index: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

function asLinkHref(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const target = value.trim();
  if (/^https?:\/\//i.test(target)) {
    return target;
  }
  return target.startsWith('/') && !target.startsWith('//') ? target : null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function columnOf(raw: Record<string, unknown>, index: number): TableColumn {
  const fallbackKey = `col${index + 1}`;
  const key = typeof raw.key === 'string' && raw.key !== '' ? raw.key : fallbackKey;
  return {
    key,
    label: typeof raw.label === 'string' && raw.label !== '' ? raw.label : key,
    format: COLUMN_FORMATS.find((candidate) => candidate === raw.format) ?? 'text',
  };
}

/** Rows keep their source index and original object; bindings only feed displayed cells. */
function rowEntries(props: Record<string, unknown>): TableRowEntry[] {
  const rows = asArray(props.rows);
  const bound = withRowBindings(rows, props);
  const entries: TableRowEntry[] = [];
  rows.forEach((value, index) => {
    const row = asRecord(value);
    if (row !== undefined) {
      entries.push({ row, cells: asRecord(bound[index]) ?? row, index });
    }
  });
  return entries;
}

function compareValues(a: unknown, b: unknown, column: TableColumn): number {
  if (column.format === 'date') {
    const aDate = asDate(a);
    const bDate = asDate(b);
    if (aDate !== null && bDate !== null) {
      return aDate.getTime() - bDate.getTime();
    }
  }
  const aNumber = asNumeric(a);
  const bNumber = asNumeric(b);
  if (aNumber !== undefined && bNumber !== undefined) {
    return aNumber - bNumber;
  }
  return cellText(a).localeCompare(cellText(b));
}

function sortedEntries(
  entries: readonly TableRowEntry[],
  column: TableColumn,
  direction: SortDirection,
): TableRowEntry[] {
  const factor = direction === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const aValue = a.cells[column.key];
    const bValue = b.cells[column.key];
    if (isMissing(aValue) || isMissing(bValue)) {
      return Number(isMissing(aValue)) - Number(isMissing(bValue));
    }
    return compareValues(aValue, bValue, column) * factor;
  });
}

/** One cell rendered per its column format: text, number, date, badge or link. */
function TableCell({ value, format }: { value: unknown; format: TableColumnFormat }): ReactNode {
  if (format === 'number') {
    const numeric = asNumeric(value);
    return (
      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
        {numeric === undefined ? cellText(value) : NUMBER_FORMAT.format(numeric)}
      </td>
    );
  }
  if (format === 'date') {
    const date = asDate(value);
    return (
      <td className="whitespace-nowrap px-2 py-1.5">
        {date === null ? cellText(value) : DATE_FORMAT.format(date)}
      </td>
    );
  }
  if (format === 'badge') {
    const text = cellText(value);
    return (
      <td className="px-2 py-1.5">
        {text === '' ? null : (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{text}</span>
        )}
      </td>
    );
  }
  if (format === 'link') {
    const href = asLinkHref(value);
    if (href === null) {
      return <td className="px-2 py-1.5">{cellText(value)}</td>;
    }
    const external = !href.startsWith('/');
    return (
      <td className="px-2 py-1.5">
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          className="text-primary underline-offset-2 hover:underline"
        >
          {cellText(value) || href}
        </a>
      </td>
    );
  }
  return <td className="px-2 py-1.5">{cellText(value)}</td>;
}

function sortMarkFor(sort: SortState | null, key: string): string {
  if (!sort || sort.key !== key) {
    return '';
  }
  return sort.direction === 'asc' ? ' ↑' : ' ↓';
}

/** Tabular rows with optional client-side sorting and a max row cap. */
export function TablePrimitive({ props, emit }: PrimitiveComponentProps): ReactNode {
  const columns = asRecordArray(props.columns).map(columnOf);
  const entries = rowEntries(props);
  const sortable =
    props.sortable === undefined || props.sortable === null ? true : asBool(props.sortable);
  const maxRows = Math.min(MAX_ROWS, Math.max(1, Math.trunc(asNumber(props.maxRows, 100))));
  const [sort, setSort] = useState<SortState | null>(null);

  if (columns.length === 0) {
    return <WidgetEmptyState message="Table has no columns" />;
  }

  const sortColumn = sort === null ? undefined : columns.find((column) => column.key === sort.key);
  const ordered =
    sort !== null && sortColumn !== undefined
      ? sortedEntries(entries, sortColumn, sort.direction)
      : entries;
  const visible = ordered.slice(0, maxRows);

  const toggleSort = (key: string): void => {
    setSort((prev) => {
      if (!prev || prev.key !== key) {
        return { key, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  return (
    <div className="h-full min-h-0 w-full overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-background">
          <tr>
            {columns.map((column, index) => (
              <th
                key={`${column.key}-${index}`}
                scope="col"
                className="border-b px-2 py-1.5 font-medium text-muted-foreground text-xs"
              >
                {sortable ? (
                  <button
                    type="button"
                    className="hover:text-foreground"
                    onClick={() => toggleSort(column.key)}
                  >
                    {column.label}
                    {sortMarkFor(sort, column.key)}
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-4 text-center text-muted-foreground">
                No rows
              </td>
            </tr>
          ) : (
            visible.map((entry) => (
              <tr
                key={entry.index}
                className="border-border/50 border-b last:border-0 hover:bg-muted/40"
                onClick={() => emit('rowClick', { row: entry.row, index: entry.index })}
              >
                {columns.map((column, index) => (
                  <TableCell
                    key={`${column.key}-${index}`}
                    value={entry.cells[column.key]}
                    format={column.format}
                  />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
