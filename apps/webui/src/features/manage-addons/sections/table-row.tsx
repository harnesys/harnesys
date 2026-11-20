import { CheckIcon, CopyIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { Switch } from '@/shared/ui/switch';
import { toast } from '@/shared/ui/toast';
import { resolveL10nText } from '../lib/route-call';
import type { AddonColumn, AddonSectionAction } from '../lib/view-sections';

export type TableRow = Record<string, unknown>;

/** Row identity used by selection and React keys; falls back to the row index. */
export function rowKeyOf(row: TableRow, index: number): string {
  return String(row.id ?? index);
}

/** One `<tr>` of a view table: selection checkbox, cells, row actions. */
export function TableRowItem({
  columns,
  row,
  actions,
  busy,
  selectable,
  selected,
  onToggle,
  onAction,
}: {
  columns: AddonColumn[];
  row: TableRow;
  actions: AddonSectionAction[];
  busy: boolean;
  selectable: boolean;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onAction: (action: AddonSectionAction, row: TableRow) => void;
}) {
  return (
    <tr className="border-border/60 border-t">
      {selectable ? (
        <td className="px-2 py-1.5">
          <Checkbox
            checked={selected}
            disabled={busy}
            onCheckedChange={(checked) => onToggle(checked === true)}
            aria-label="Select row"
            data-testid="addon-table-row-select"
          />
        </td>
      ) : null}
      {columns.map((column) => (
        <td key={column.key} className="max-w-[260px] px-2 py-1.5 text-xs">
          {formatCell(column, row[column.key])}
        </td>
      ))}
      {actions.length > 0 ? (
        <td className="sticky right-0 whitespace-nowrap border-border/60 border-l bg-popover px-2 py-1.5 text-right">
          {actions.map((action) => {
            const checkedKey = action.checkedKey;
            if (action.kind === 'switch' && checkedKey !== undefined) {
              return (
                <Switch
                  key={action.id}
                  checked={row[checkedKey] === true}
                  disabled={busy}
                  aria-label={resolveL10nText(action.label)}
                  onCheckedChange={(checked) => {
                    if (checked !== row[checkedKey]) {
                      onAction(action, row);
                    }
                  }}
                />
              );
            }
            if (action.kind === 'form') {
              return (
                <Button
                  key={action.id}
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onAction(action, row)}
                >
                  {resolveL10nText(action.label)}
                </Button>
              );
            }
            return (
              <Button
                key={action.id}
                type="button"
                size="xs"
                variant={action.destructive ? 'destructive' : 'outline'}
                disabled={busy}
                onClick={() => onAction(action, row)}
              >
                {resolveL10nText(action.label)}
              </Button>
            );
          })}
        </td>
      ) : null}
    </tr>
  );
}

export function formatCell(column: AddonColumn, value: unknown): ReactNode {
  if (value === undefined || value === null) {
    return '—';
  }
  if (column.format === 'datetime' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  if (column.format === 'badge') {
    const text = String(value);
    return <RowChip tone={badgeToneOf(text)}>{text}</RowChip>;
  }
  if (column.format === 'copy') {
    return <CopyCell value={String(value)} />;
  }
  if (column.format === 'number') {
    return <span className="font-mono">{String(value)}</span>;
  }
  const text = String(value);
  return (
    <span className="block max-w-full truncate" title={text}>
      {text}
    </span>
  );
}

/** Plain text projection of a row cell, used by the client-side table search. */
export function rowSearchText(columns: AddonColumn[], row: TableRow): string {
  return columns
    .map((column) => row[column.key])
    .filter((value) => value !== undefined && value !== null)
    .join(' ');
}

export function selectedRowsOf(rows: TableRow[], selected: Set<string>): TableRow[] {
  return rows.filter((row, index) => selected.has(rowKeyOf(row, index)) && row.id !== undefined);
}

export function visibleRowsOf(
  rows: TableRow[],
  columns: AddonColumn[],
  needle: string,
): TableRow[] {
  if (!needle) {
    return rows;
  }
  return rows.filter((row, index) =>
    `${rowKeyOf(row, index)} ${rowSearchText(columns, row)}`.toLowerCase().includes(needle),
  );
}

export function allSelectedOf(rows: TableRow[], selected: Set<string>): boolean {
  return rows.length > 0 && rows.every((row, index) => selected.has(rowKeyOf(row, index)));
}

const BADGE_TONES: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  bound: 'ok',
  connected: 'ok',
  enabled: 'ok',
  fired: 'ok',
  live: 'ok',
  ok: 'ok',
  on: 'ok',
  secure: 'ok',
  success: 'ok',
  true: 'ok',
  deduped: 'warn',
  discovered: 'warn',
  insecure: 'warn',
  paused: 'warn',
  pending: 'warn',
  queued: 'warn',
  suppressed: 'warn',
  throttled: 'warn',
  disabled: 'danger',
  disconnected: 'danger',
  error: 'danger',
  failed: 'danger',
  off: 'danger',
  rejected: 'danger',
  false: 'neutral',
  none: 'neutral',
  empty: 'neutral',
  unknown: 'neutral',
};

function badgeToneOf(value: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  return BADGE_TONES[value.toLowerCase()] ?? 'neutral';
}

function CopyCell({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.add({ title: 'Could not copy value' });
    }
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate font-mono text-xs" title={value}>
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="Copy"
        onClick={() => {
          void copy();
        }}
      >
        {copied ? <CheckIcon className="size-3 text-chart-1" /> : <CopyIcon className="size-3" />}
      </Button>
    </span>
  );
}
