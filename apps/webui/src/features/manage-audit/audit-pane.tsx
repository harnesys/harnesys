import { useInfiniteQuery } from '@tanstack/react-query';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { listOrgAudit, type OrgAuditItem, orgAuditQueryKey } from '@/shared/api/org-audit';
import { formatDayTime } from '@/shared/lib/format-clock';
import { Button } from '@/shared/ui/button';
import { Row, RowChip, RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';

type ChipTone = 'neutral' | 'ok' | 'warn' | 'danger';

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

  return (
    <div className="flex w-full flex-col gap-8" data-testid="audit-pane">
      <RowHeader
        label="Audit log"
        count={query.isPending ? undefined : total}
        description="Security and fleet events for this organization, newest first."
      />

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
      <RowList>
        {items.map((row) => (
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
