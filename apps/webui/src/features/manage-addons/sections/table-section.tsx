import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import { Button } from '@/shared/ui/button';
import { RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import {
  filterParamsOf,
  handleSectionResult,
  resolveL10nText,
  routeParamsOf,
  withConfirm,
} from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type {
  AddonColumn,
  AddonRouteRef,
  AddonSectionAction,
  AddonTableFilter,
  SectionL10n,
} from '../lib/view-sections';
import { RowFormDialog } from './row-form-dialog';
import { allSelectedOf, rowKeyOf, selectedRowsOf, type TableRow, visibleRowsOf } from './table-row';
import { TableToolbar } from './table-toolbar';
import { TableView } from './table-view';

interface TableResponse {
  rows?: Record<string, unknown>[];
  nextCursor?: string;
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
      return (await fetchAddonRoute(orgId, addonId, source?.route ?? '/', {
        ...params,
        ...(cursor ? { cursor } : {}),
      })) as TableResponse;
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

  const postAction = async (
    routeRef: AddonRouteRef,
    route: string,
    body?: Record<string, unknown>,
    row?: TableRow,
  ) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        route,
        { ...routeParamsOf(routeRef, row), ...filterParams },
        { method: 'POST', ...(body === undefined ? {} : { body }) },
      );
      handleSectionResult(response, refresh);
      await invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runAction = (action: AddonSectionAction, row: TableRow) => {
    if (action.kind === 'form') {
      setRowForm({ action, row });
      return;
    }
    withConfirm(action, () => void postAction(action.route, action.route.route, undefined, row));
  };

  const runSelectionAction = (action: AddonSectionAction) => {
    const ids = selectedRows.map((row) => row.id);
    if (ids.length === 0) {
      return;
    }
    withConfirm(
      action,
      () =>
        void postAction(action.route, action.route.route, { ids }).then(() =>
          setSelected(new Set()),
        ),
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
  const runMasterToggle = (enabled: boolean) => {
    if (masterAction === undefined || masterAction.batchRoute === undefined) {
      return;
    }
    const routeRef = masterAction.batchRoute;
    withConfirm(masterAction, () => void postAction(routeRef, routeRef.route, { enabled }));
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
        <TableView
          columns={columns}
          rows={visibleRows}
          rowActions={rowActions}
          busy={busy}
          selectable={selectable}
          selected={selected}
          allSelected={allVisibleSelected}
          masterAction={masterAction}
          onToggleRow={toggleRow}
          onToggleAll={toggleAllVisible}
          onMasterToggle={runMasterToggle}
          onAction={runAction}
        />
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
