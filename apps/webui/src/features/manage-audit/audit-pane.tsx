import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebouncedValue } from '@/features/find-in-files/model/use-debounced-value';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { AUDIT_PAGE_SIZE, type OrgAuditQuery, orgAuditPageOptions } from '@/shared/api/org-audit';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
  RowListSkeleton,
  SettingsEmpty,
  SettingsErrorBanner,
  SettingsSection,
} from '@/shared/ui/settings-kit';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import {
  AUDIT_ACTOR_KIND_OPTIONS,
  AUDIT_RANGE_PRESETS,
  AUDIT_RESULT_OPTIONS,
  AUDIT_SEARCH_DEBOUNCE_MS,
  type AuditFilterState,
  auditQueryFromFilters,
  auditRangeFromPreset,
} from './model/audit-filters';
import { exportAuditCsv } from './model/export-audit-csv';
import { AuditTable } from './ui/audit-table';

function AuditFilters({
  filters,
  onChange,
}: {
  filters: AuditFilterState;
  onChange: (patch: Partial<AuditFilterState>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="audit-filters">
      <ToggleGroup
        variant="segment"
        size="sm"
        value={[String(filters.preset)]}
        onValueChange={(next) => {
          const picked = next[0];
          const found = AUDIT_RANGE_PRESETS.find((preset) => String(preset) === picked);
          if (found !== undefined) {
            onChange({ preset: found });
          }
        }}
        data-testid="audit-range-toggle"
      >
        {AUDIT_RANGE_PRESETS.map((preset) => (
          <ToggleGroupItem key={preset} value={String(preset)}>
            {preset}d
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select
        items={AUDIT_ACTOR_KIND_OPTIONS}
        value={filters.actorKind}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange({ actorKind: next });
          }
        }}
      >
        <SelectTrigger size="sm" aria-label="Filter by actor kind" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIT_ACTOR_KIND_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        items={AUDIT_RESULT_OPTIONS}
        value={filters.result}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange({ result: next });
          }
        }}
      >
        <SelectTrigger size="sm" aria-label="Filter by result" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIT_RESULT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        aria-label="Search audit events"
        placeholder="Search resource or actor..."
        className="max-w-56"
        value={filters.q}
        onChange={(event) => {
          onChange({ q: event.target.value });
        }}
      />
    </div>
  );
}

function AuditPagination({
  offset,
  total,
  onOffset,
}: {
  offset: number;
  total: number;
  onOffset: (offset: number) => void;
}) {
  const first = offset + 1;
  const last = Math.min(offset + AUDIT_PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between" data-testid="audit-pagination">
      <span className="text-muted-foreground text-xs">
        {first}–{last} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={offset === 0}
          onClick={() => {
            onOffset(Math.max(0, offset - AUDIT_PAGE_SIZE));
          }}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={last >= total}
          onClick={() => {
            onOffset(offset + AUDIT_PAGE_SIZE);
          }}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function OrgAuditPane({ orgId }: { orgId: string }) {
  const timeZone = useOrgTimeZone();
  const [filters, setFilters] = useState<AuditFilterState>(() => ({
    preset: 7,
    range: auditRangeFromPreset(7, timeZone),
    actorKind: 'all',
    result: 'all',
    q: '',
  }));
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const debouncedQ = useDebouncedValue(filters.q.trim(), AUDIT_SEARCH_DEBOUNCE_MS);

  const changeFilters = (patch: Partial<AuditFilterState>) => {
    if (patch.preset !== undefined && patch.preset !== filters.preset) {
      patch.range = auditRangeFromPreset(patch.preset, timeZone);
    }
    setFilters((previous) => ({ ...previous, ...patch }));
    setOffset(0);
  };

  const pageQuery: OrgAuditQuery = auditQueryFromFilters(
    { ...filters, q: debouncedQ },
    AUDIT_PAGE_SIZE,
    offset,
  );
  const page = useQuery(orgAuditPageOptions(orgId, pageQuery));
  const items = page.data?.items ?? [];
  const total = page.data?.total ?? 0;

  const runExport = () => {
    setExporting(true);
    setExportError(null);
    exportAuditCsv(orgId, auditQueryFromFilters(filters))
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
      }
    >
      <div className="flex flex-col gap-3">
        <AuditFilters filters={filters} onChange={changeFilters} />
        {page.isPending ? <RowListSkeleton rows={6} testId="audit-loading" /> : null}
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
        {!page.isPending && !page.isError && items.length === 0 ? (
          <SettingsEmpty
            testId="audit-empty"
            title="No audit events match the current filters"
            description="Security and fleet events will appear here."
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
