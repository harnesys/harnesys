import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { fetchAddonRoute, orgAddonDetailQueryKey } from '@/shared/api/addons';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowChip, RowItem, RowSection } from '@/shared/ui/capability-rows';
import { SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { handleSectionResult, resolveL10nText, routeParamsOf } from '../lib/route-call';
import type { SectionProps } from '../lib/section-props';
import type { AddonColumn, AddonSectionAction, SectionL10n } from '../lib/view-sections';

interface TableResponse {
  rows?: Record<string, unknown>[];
  nextCursor?: string;
}

export function TableSection({ orgId, addonId, section }: SectionProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadedCursors = useRef<Set<string>>(new Set());

  const title = section.title as SectionL10n | undefined;
  const source = section.source as { route: string; params?: Record<string, string> } | undefined;
  const columns = Array.isArray(section.columns) ? (section.columns as AddonColumn[]) : [];
  const rowActions = Array.isArray(section.rowActions)
    ? (section.rowActions as AddonSectionAction[])
    : [];
  const enabled = Boolean(title && source);

  const params = routeParamsOf(source ?? { route: '/' });
  const result = useQuery({
    queryKey: [
      ...orgAddonDetailQueryKey(orgId, addonId),
      'table',
      source?.route ?? '',
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
    void result.refetch();
  };

  const callAction = async (action: AddonSectionAction, row: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAddonRoute(
        orgId,
        addonId,
        action.route.route,
        routeParamsOf(action.route, row),
        { method: 'POST' },
      );
      handleSectionResult(response, refresh);
      await queryClient.invalidateQueries({
        queryKey: orgAddonDetailQueryKey(orgId, addonId),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = () => {
    if (result.data?.nextCursor) {
      setCursor(result.data.nextCursor);
    }
  };

  const runAction = (action: AddonSectionAction, row: Record<string, unknown>) => {
    if (action.confirm) {
      void alert
        .confirm({
          title: resolveL10nText(action.confirm),
          testId: `addon-action-confirm-${action.id}`,
        })
        .then((ok) => {
          if (ok) {
            void callAction(action, row);
          }
        });
      return;
    }
    void callAction(action, row);
  };

  if (!title || !source) {
    return null;
  }

  return (
    <RowSection label={resolveL10nText(title)} count={rows.length}>
      {error ? <SettingsErrorBanner message={error} testId="addon-table-error" /> : null}
      {rows.length === 0 ? (
        <RowItem title="Nothing here yet" />
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5" data-testid="addon-table-rows">
          {rows.map((row, index) => (
            <TableCard
              key={String(row.id ?? index)}
              columns={columns}
              row={row}
              actions={rowActions}
              busy={busy}
              onAction={runAction}
            />
          ))}
        </div>
      )}
      {result.data?.nextCursor ? (
        <div>
          <Button type="button" size="sm" variant="ghost" onClick={loadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </RowSection>
  );
}

function TableCard({
  columns,
  row,
  actions,
  busy,
  onAction,
}: {
  columns: AddonColumn[];
  row: Record<string, unknown>;
  actions: AddonSectionAction[];
  busy: boolean;
  onAction: (action: AddonSectionAction, row: Record<string, unknown>) => void;
}) {
  const primary = columns.find((column) => column.format !== 'badge') ?? columns[0];
  if (!primary) {
    return null;
  }
  const badges = columns.filter((column) => column.format === 'badge' && column !== primary);
  const details = columns.filter((column) => column !== primary && column.format !== 'badge');
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-popover px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium text-sm">
            {formatCell(primary, row[primary.key])}
          </span>
          {badges.map((column) => (
            <span key={column.key} className="shrink-0">
              {formatCell(column, row[column.key])}
            </span>
          ))}
        </div>
        {actions.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {actions.map((action) => (
              <Button
                key={action.id}
                type="button"
                size="sm"
                variant={action.destructive ? 'destructive' : 'outline'}
                disabled={busy}
                onClick={() => onAction(action, row)}
              >
                {resolveL10nText(action.label)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {details.length > 0 ? (
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          {details.map((column) => (
            <div key={column.key} className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                {resolveL10nText(column.label)}
              </span>
              <span className="min-w-0 text-xs">{formatCell(column, row[column.key])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatCell(column: AddonColumn, value: unknown): ReactNode {
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
  return String(value);
}

const BADGE_TONES: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  active: 'ok',
  bound: 'ok',
  connected: 'ok',
  fired: 'ok',
  live: 'ok',
  ok: 'ok',
  success: 'ok',
  deduped: 'warn',
  discovered: 'warn',
  paused: 'warn',
  pending: 'warn',
  queued: 'warn',
  suppressed: 'warn',
  throttled: 'warn',
  disabled: 'danger',
  disconnected: 'danger',
  error: 'danger',
  failed: 'danger',
  rejected: 'danger',
  none: 'neutral',
  empty: 'neutral',
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
