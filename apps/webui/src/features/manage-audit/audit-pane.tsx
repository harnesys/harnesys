import { useQuery } from '@tanstack/react-query';
import { RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useDebouncedValue } from '@/features/find-in-files/model/use-debounced-value';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { AUDIT_PAGE_SIZE, type OrgAuditQuery, orgAuditPageOptions } from '@/shared/api/org-audit';
import { Button } from '@/shared/ui/button';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
  SettingsWarnBanner,
} from '@/shared/ui/settings-kit';
import {
  AUDIT_SEARCH_DEBOUNCE_MS,
  type AuditFilterState,
  auditQueryFromFilters,
  auditRangeOf,
} from './model/audit-filters';
import {
  type AuditExportNotice,
  type AuditExportResult,
  exportAuditCsv,
} from './model/export-audit-csv';
import { AuditPagination } from './ui/audit-pagination';
import { AuditTable } from './ui/audit-table';
import { AuditToolbar } from './ui/audit-toolbar';

const DEFAULT_FILTERS: AuditFilterState = {
  preset: 7,
  customFrom: '',
  customTo: '',
  actorKind: 'all',
  result: 'all',
  q: '',
};

function filtersDirty(filters: AuditFilterState): boolean {
  return (
    filters.preset !== DEFAULT_FILTERS.preset ||
    filters.customFrom !== DEFAULT_FILTERS.customFrom ||
    filters.customTo !== DEFAULT_FILTERS.customTo ||
    filters.actorKind !== DEFAULT_FILTERS.actorKind ||
    filters.result !== DEFAULT_FILTERS.result ||
    filters.q.trim() !== DEFAULT_FILTERS.q
  );
}

export function OrgAuditPane({ orgId }: { orgId: string }) {
  const timeZone = useOrgTimeZone();
  const [filters, setFilters] = useState<AuditFilterState>(DEFAULT_FILTERS);
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<AuditExportNotice | null>(null);
  const debouncedQ = useDebouncedValue(filters.q.trim(), AUDIT_SEARCH_DEBOUNCE_MS);

  const changeFilters = (patch: Partial<AuditFilterState>) => {
    setFilters((previous) => ({ ...previous, ...patch }));
    setOffset(0);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setOffset(0);
  };

  const range = auditRangeOf(filters, timeZone);
  const pageQuery: OrgAuditQuery = auditQueryFromFilters(
    { ...filters, q: debouncedQ },
    range,
    AUDIT_PAGE_SIZE,
    offset,
  );
  const page = useQuery(orgAuditPageOptions(orgId, pageQuery));
  const items = page.data?.items ?? [];
  const total = page.data?.total ?? 0;
  const dirty = filtersDirty(filters);

  const runExport = () => {
    setExporting(true);
    setExportError(null);
    setExportNotice(null);
    exportAuditCsv(orgId, auditQueryFromFilters({ ...filters, q: debouncedQ }, range))
      .then((result: AuditExportResult) => {
        if (!result.downloaded) {
          setExportNotice({ title: 'No audit events match the current filters' });
        } else if (result.truncated) {
          setExportNotice({
            title: `Export truncated to the first ${result.rowCount} rows`,
          });
        }
      })
      .catch((error: unknown) => {
        setExportError(error instanceof Error ? error.message : 'Export failed');
      })
      .finally(() => {
        setExporting(false);
      });
  };

  return (
    <SettingsSection
      label="Audit log"
      count={page.isPending ? undefined : total}
      description="Security and fleet events for this organization, newest first."
      testId="audit-pane"
      actions={
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={page.isFetching}
            onClick={() => {
              void page.refetch();
            }}
            data-testid="audit-refresh"
          >
            <RefreshCwIcon className={page.isFetching ? 'animate-spin' : undefined} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={runExport}
            data-testid="audit-export"
          >
            {exporting ? 'Exporting...' : 'Download CSV'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <AuditToolbar
          filters={filters}
          timeZone={timeZone}
          dirty={dirty}
          onChange={changeFilters}
          onReset={resetFilters}
        />
        {page.isPending ? <RowListSkeleton rows={8} testId="audit-loading" /> : null}
        {page.isError ? (
          <SettingsErrorBanner
            testId="audit-error"
            message={page.error instanceof Error ? page.error.message : 'Audit request failed'}
            onRetry={() => {
              void page.refetch();
            }}
          />
        ) : null}
        {exportError !== null ? (
          <SettingsErrorBanner testId="audit-export-error" message={exportError} />
        ) : null}
        {exportNotice !== null ? (
          <SettingsWarnBanner testId="audit-export-notice" title={exportNotice.title} />
        ) : null}
        {!page.isPending && !page.isError && items.length === 0 ? (
          <SettingsEmpty
            testId="audit-empty"
            title={dirty ? 'No events match these filters' : 'No audit events yet'}
            description={
              dirty
                ? 'Try a wider time range, or clear the filters to see every event.'
                : 'Security and fleet events for this organization will appear here.'
            }
            action={
              dirty ? (
                <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {items.length > 0 ? <AuditTable rows={items} /> : null}
        {items.length > 0 ? (
          <AuditPagination offset={offset} total={total} onOffset={setOffset} />
        ) : null}
      </div>
    </SettingsSection>
  );
}
