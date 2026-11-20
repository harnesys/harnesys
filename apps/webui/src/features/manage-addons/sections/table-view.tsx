import { Checkbox } from '@/shared/ui/checkbox';
import { Switch } from '@/shared/ui/switch';
import { resolveL10nText } from '../lib/route-call';
import type { AddonColumn, AddonSectionAction } from '../lib/view-sections';
import { rowKeyOf, type TableRow, TableRowItem } from './table-row';

interface TableViewProps {
  columns: AddonColumn[];
  rows: TableRow[];
  rowActions: AddonSectionAction[];
  busy: boolean;
  selectable: boolean;
  selected: Set<string>;
  allSelected: boolean;
  masterAction: AddonSectionAction | undefined;
  onToggleRow: (key: string, checked: boolean) => void;
  onToggleAll: () => void;
  onMasterToggle: (enabled: boolean) => void;
  onAction: (action: AddonSectionAction, row: TableRow) => void;
}

export function TableView({
  columns,
  rows,
  rowActions,
  busy,
  selectable,
  selected,
  allSelected,
  masterAction,
  onToggleRow,
  onToggleAll,
  onMasterToggle,
  onAction,
}: TableViewProps) {
  const masterCheckedKey = masterAction?.checkedKey;
  const masterChecked =
    masterCheckedKey !== undefined &&
    rows.length > 0 &&
    rows.every((row) => row[masterCheckedKey] === true);
  return (
    <div className="max-h-[420px] overflow-y-auto rounded-lg border" data-testid="addon-table-rows">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-popover">
          <tr>
            {selectable ? (
              <th className="w-8 px-2 py-2">
                <Checkbox
                  checked={allSelected}
                  disabled={busy}
                  onCheckedChange={() => onToggleAll()}
                  aria-label="Select all rows"
                  data-testid="addon-table-select-all"
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-2 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide"
              >
                {resolveL10nText(column.label)}
              </th>
            ))}
            {rowActions.length > 0 ? (
              <th
                aria-label="Actions"
                className="sticky right-0 z-10 bg-popover px-2 py-2 text-right"
              >
                <div className="flex justify-end">
                  {masterAction ? (
                    <Switch
                      checked={masterChecked}
                      disabled={busy}
                      aria-label="Toggle all rows"
                      onCheckedChange={(checked) => onMasterToggle(checked === true)}
                      data-testid="addon-table-master-toggle"
                    />
                  ) : null}
                </div>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <TableRowItem
              key={rowKeyOf(row, index)}
              columns={columns}
              row={row}
              actions={rowActions}
              busy={busy}
              selectable={selectable}
              selected={selected.has(rowKeyOf(row, index))}
              onToggle={(checked) => onToggleRow(rowKeyOf(row, index), checked)}
              onAction={onAction}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
