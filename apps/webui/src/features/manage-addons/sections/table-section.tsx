import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { Checkbox } from '@/shared/ui/checkbox';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { Switch } from '@/shared/ui/switch';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type {
  AddonColumn,
  AddonSectionAction,
  AddonTableFilter,
  SectionL10n,
} from '../lib/view-sections';
import { RowFormDialog } from './row-form-dialog';
import { rowKeyOf, rowSearchText, type TableRow, TableRowItem } from './table-row';
import { TableToolbar } from './table-toolbar';

interface TableResponse {
  rows?: Record<string, unknown>[];
  nextCursor?: string;
}

function withConfirm(action: AddonSectionAction, run: () => void): void {
  if (action.confirm) {
    void alert
      .confirm({
        title: resolveL10nText(action.confirm),
        testId: `addon-action-confirm-${action.id}`,
      })
      .then((ok) => {
        if (ok) {
          run();
        }
      });
    return;
  }
  run();
}

function filterParamsOf(
  filters: AddonTableFilter[],
  values: Record<string, string>,
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const filter of filters) {
    const value = values[filter.key];
    if (value !== undefined && value !== '') {
      params[filter.key] = value;
    }
  }
  return params;
}

function selectedRowsOf(rows: TableRow[], selected: Set<string>): TableRow[] {
  return rows.filter((row, index) => selected.has(rowKeyOf(row, index)) && row.id !== undefined);
}

function visibleRowsOf(rows: TableRow[], columns: AddonColumn[], needle: string): TableRow[] {
  if (!needle) {
    return rows;
  }
  return rows.filter((row, index) =>
    `${rowKeyOf(row, index)} ${rowSearchText(columns, row)}`.toLowerCase().includes(needle),
  );
}

function allSelectedOf(rows: TableRow[], selected: Set<string>): boolean {
  return rows.length > 0 && rows.every((row, index) => selected.has(rowKeyOf(row, index)));
}

export function TableSection({ orgId, addonId, detail, section }: SectionProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<TableRow[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [rowForm, setRowForm] = useState<{ action: AddonSectionAction; row: TableRow } | null>(
    null,
  );
  const loadedCursors = useRef<Set<string>>(new Set());

  const title = section.title as SectionL10n | undefined;
  const source = section.source as { route: string; params?: Record<string, string> } | undefined;
  const columns = Array.isArray(section.columns) ? (section.columns as AddonColumn[]) : [];
  const rowActions = Array.isArray(section.rowActions)
    ? (section.rowActions as AddonSectionAction[])
    : [];
  const filters = Array.isArray(section.filters) ? (section.filters as AddonTableFilter[]) : [];
  const selectionActions = Array.isArray(section.selectionActions)
    ? (section.selectionActions as AddonSectionAction[])
    : [];
  const headerActions = Array.isArray(section.headerActions)
    ? (section.headerActions as AddonSectionAction[])
    : [];
  const selectable = section.selectable === true;
  const searchEnabled = section.search === true;
  const enabled = Boolean(title && source);

  const filterParams = filterParamsOf(filters, filterValues);
  const params = { ...routeParamsOf(source ?? { route: '/' }), ...filterParams };
  const result = useQuery({
    queryKey: [
      ...orgAddonDetailQueryKey(orgId, addonId),
      'table',
      source?.route ?? '',
      params,
      cursor,
    ] as const,
    queryFn: async () => {
      const page = (await fetchAddonRoute(orgId, addonId, source?.route ?? '/', {
        ...params,
        ...(cursor ? { cursor } : {}),
      })) as TableResponse;
      return page;
    },
    enabled,
  });

  useEffect(() => {
    if (!result.data) {
      return;
    }
    const fetched = result.data.rows ?? [];
    if (cursor === undefined) {
      loadedCursors.current = new Set();
      setRows(fetched);
      return;
    }
    if (loadedCursors.current.has(cursor)) {
      return;
    }
    loadedCursors.current.add(cursor);
    setRows((current) => [...current, ...fetched]);
  }, [cursor, result.data]);

  const refresh = () => {
    loadedCursors.current = new Set();
    setCursor(undefined);
    setSelected(new Set());
    void result.refetch();
  };

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) });
    await queryClient.invalidateQueries({ queryKey: ['addon-route-options', orgId, addonId] });
  };

  const selectedRows = selectable ? selectedRowsOf(rows, selected) : [];

  const callAction = async (action: AddonSectionAction, row: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        action.route.route,
        { ...routeParamsOf(action.route, row), ...filterParams },
        { method: 'POST' },
      );
      handleSectionResult(response, refresh);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const callSelectionAction = async (action: AddonSectionAction, ids: unknown[]) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAddonRoute(orgId, addonId, action.route.route, filterParams, {
        method: 'POST',
        body: { ids },
      });
      handleSectionResult(response, refresh);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action: AddonSectionAction, row: Record<string, unknown>) => {
    if (action.kind === 'form') {
      setRowForm({ action, row });
      return;
    }
    withConfirm(action, () => void callAction(action, row));
  };

  const runSelectionAction = (action: AddonSectionAction) => {
    const ids = selectedRows.map((row) => row.id);
    if (ids.length === 0) {
      return;
    }
    withConfirm(
      action,
      () => void callSelectionAction(action, ids).then(() => setSelected(new Set())),
    );
  };

  const toggleRow = (key: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const needle = search.trim().toLowerCase();
  const visibleRows = visibleRowsOf(rows, columns, needle);
  const allVisibleSelected = allSelectedOf(visibleRows, selected);
  const masterAction = rowActions.find(
    (action) => action.kind === 'switch' && action.batchRoute !== undefined,
  );
  const masterCheckedKey = masterAction?.checkedKey;
  const masterChecked =
    masterCheckedKey !== undefined &&
    visibleRows.length > 0 &&
    visibleRows.every((row) => row[masterCheckedKey] === true);
  const runMasterToggle = (enabled: boolean) => {
    if (!masterAction) {
      return;
    }
    withConfirm(
      masterAction,
      () =>
        void fetchAddonRoute(orgId, addonId, masterAction.batchRoute?.route ?? '', filterParams, {
          method: 'POST',
          body: { enabled },
        })
          .then((response) => {
            handleSectionResult(response, refresh);
            return invalidate();
          })
          .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))),
    );
  };
  const toggleAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      for (const [index, row] of visibleRows.entries()) {
        const key = rowKeyOf(row, index);
        if (allVisibleSelected) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  };

  const loadMore = () => {
    if (result.data?.nextCursor) {
      setCursor(result.data.nextCursor);
    }
  };

  if (!title || !source) {
    return null;
  }

  return (
    <RowSection
      label={resolveL10nText(title)}
      count={visibleRows.length}
      actions={
        <div className="flex flex-wrap gap-1.5">
          {headerActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => setRowForm({ action, row: {} })}
              data-testid={`addon-table-header-${action.id}`}
            >
              {resolveL10nText(action.label)}
            </Button>
          ))}
        </div>
      }
    >
      {error ? <SettingsErrorBanner message={error} testId="addon-table-error" /> : null}
      {filters.length > 0 || searchEnabled ? (
        <TableToolbar
          orgId={orgId}
          addonId={addonId}
          filters={filters}
          values={filterValues}
          disabled={busy}
          onFilter={(key, value) => {
            setFilterValues((current) => ({ ...current, [key]: value }));
            setSelected(new Set());
          }}
          searchEnabled={searchEnabled}
          search={search}
          onSearch={(value) => setSearch(value)}
        />
      ) : null}
      {selectable && selectedRows.length > 0 && selectionActions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="addon-table-bulk">
          {selectionActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.destructive ? 'destructive' : 'outline'}
              disabled={busy}
              onClick={() => runSelectionAction(action)}
            >
              {resolveL10nText(action.label)} ({selectedRows.length})
            </Button>
          ))}
        </div>
      ) : null}
      {visibleRows.length === 0 ? (
        <RowItem title={rows.length === 0 ? 'Nothing here yet' : 'No matches'} />
      ) : (
        <div
          className="max-h-[420px] overflow-y-auto rounded-lg border"
          data-testid="addon-table-rows"
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-popover">
              <tr>
                {selectable ? (
                  <th className="w-8 px-2 py-2">
                    <Checkbox
                      checked={allVisibleSelected}
                      disabled={busy}
                      onCheckedChange={() => toggleAllVisible()}
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
                          onCheckedChange={(checked) => runMasterToggle(checked === true)}
                          data-testid="addon-table-master-toggle"
                        />
                      ) : null}
                    </div>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <TableRowItem
                  key={rowKeyOf(row, index)}
                  columns={columns}
                  row={row}
                  actions={rowActions}
                  busy={busy}
                  selectable={selectable}
                  selected={selected.has(rowKeyOf(row, index))}
                  onToggle={(checked) => toggleRow(rowKeyOf(row, index), checked)}
                  onAction={runAction}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.data?.nextCursor ? (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
      {rowForm ? (
        <RowFormDialog
          orgId={orgId}
          addonId={addonId}
          action={rowForm.action}
          row={rowForm.row}
          connections={detail.connections}
          onClose={() => setRowForm(null)}
        />
      ) : null}
    </RowSection>
  );
}
