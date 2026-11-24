import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { listOrgAudit, type OrgAuditItem, orgAuditQueryKey } from '@/shared/api/org-audit';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import { Input } from '@/shared/ui/input';
import { RowListSkeleton, SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';

type ChipTone = 'neutral' | 'ok' | 'warn' | 'danger';
type AuditScope = 'all' | 'browser';

const AUDIT_RESULT_TONES: Record<string, ChipTone> = {
  ok: 'ok',
  denied: 'warn',
  error: 'danger',
};

function resultTone(result: string): ChipTone {
  return AUDIT_RESULT_TONES[result] ?? 'neutral';
}

function actorLabel(row: OrgAuditItem): string {
  const shortId = row.actorId.length > 12 ? `${row.actorId.slice(0, 12)}…` : row.actorId;
  return `${row.actorKind}:${shortId}`;
}

function matchesFilter(row: OrgAuditItem, needle: string, scope: AuditScope): boolean {
  if (scope === 'browser' && !row.action.startsWith('browser.')) {
    return false;
  }
  if (needle === '') {
    return true;
  }
  return (
    row.action.toLowerCase().includes(needle) ||
    row.resource.toLowerCase().includes(needle) ||
    actorLabel(row).toLowerCase().includes(needle)
  );
}

export function OrgAuditPane({ orgId }: { orgId: string }) {
  const query = useInfiniteQuery({
    queryKey: orgAuditQueryKey(orgId),
    queryFn: ({ pageParam }) => listOrgAudit(orgId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
      return loaded < lastPage.total && lastPage.items.length > 0 ? loaded : undefined;
    },
    staleTime: 5000,
    enabled: Boolean(orgId),
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<AuditScope>('all');
  const needle = filter.trim().toLowerCase();
  const shown = items.filter((row) => matchesFilter(row, needle, scope));

  return (
    <div className="flex w-full flex-col gap-8" data-testid="audit-pane">
      <RowHeader
        label="Audit log"
        count={query.isPending ? undefined : total}
        description="Security and fleet events for this organization, newest first."
      />

      <div className="flex items-center gap-2" data-testid="audit-filter">
        <Input
          aria-label="Filter audit events"
          placeholder="Filter by action, target or actor..."
          className="max-w-64"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[scope]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'all' || next === 'browser') {
              setScope(next);
            }
          }}
        >
          <ToggleGroupItem value="all" className="min-w-[44px] text-[11px]">
            All
          </ToggleGroupItem>
          <ToggleGroupItem value="browser" className="min-w-[44px] text-[11px]">
            Browser
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {query.isPending && <RowListSkeleton testId="audit-loading" />}
      {query.isError && (
        <SettingsErrorBanner
          testId="audit-error"
          message={query.error instanceof Error ? query.error.message : 'Audit request failed'}
          onRetry={() => {
            void query.refetch();
          }}
        />
      )}
      {!query.isPending && !query.isError && items.length === 0 ? (
        <SettingsEmpty
          testId="audit-empty"
          title="No audit events"
          description="Security and fleet events will appear here."
        />
      ) : null}
      {shown.length === 0 && items.length > 0 && (
        <p className="py-2 text-muted-foreground text-xs" data-testid="audit-filter-empty">
          No events match the filter.
        </p>
      )}
      <RowList>
        {shown.map((row) => (
          <AuditRow key={row.id} row={row} />
        ))}
      </RowList>
      {query.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={query.isFetchingNextPage}
          data-testid="audit-load-more"
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
        </Button>
      ) : null}
    </div>
  );
}

function AuditRow({ row }: { row: OrgAuditItem }) {
  const timeZone = useOrgTimeZone();
  const details = row.viaNodeId ? `${row.resource} · via ${row.viaNodeId}` : row.resource;
  return (
    <Row
      testId={`audit-${row.id}`}
      title={row.action}
      meta={formatDayTime(row.at, timeZone)}
      mono={false}
      muted
      chips={<RowChip tone={resultTone(row.result)}>{row.result}</RowChip>}
      summary={`${actorLabel(row)} · ${details}`}
      alwaysShowActions={false}
    />
  );
}
