import type { FleetNode, SourceHostStatus } from '@harnesys/contracts';
import { LockIcon } from 'lucide-react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { StatusDot, type StatusDotTone } from '@/shared/ui/status-dot';
import { Switch } from '@/shared/ui/switch';
import {
  actionErrorFor,
  detailCopy,
  materializationTone,
  nodeRoleLabel,
  nodeTone,
  shortId,
} from './source-host-status-matrix.helpers';

export interface HostStatusRowProps {
  row: SourceHostStatus;
  node: FleetNode | undefined;
  distributionKind: 'host-bound' | 'cloud-drive';
  showActions: boolean;
  isOrigin: boolean;
  canAllow: boolean;
  allowed: boolean;
  allowBusy: boolean;
  onToggleAllowed: (next: boolean) => void;
  onPrepare?: () => void;
  onRefresh?: () => void;
  preparing?: boolean;
  refreshing?: boolean;
  actionError?: string | null;
}

export function HostStatusRow({
  row,
  node,
  distributionKind,
  showActions,
  isOrigin,
  canAllow,
  allowed,
  allowBusy,
  onToggleAllowed,
  onPrepare,
  onRefresh,
  preparing,
  refreshing,
  actionError,
}: HostStatusRowProps) {
  const timeZone = useOrgTimeZone();
  const name = node?.name ?? shortId(row.hostId);
  const role = nodeRoleLabel(node?.role);
  const detail = detailCopy(row, distributionKind);
  const canPrepare =
    onPrepare &&
    row.nodeStatus === 'online' &&
    (row.materialization === 'absent' ||
      row.materialization === 'failed' ||
      (distributionKind === 'cloud-drive' && row.refreshRequired)) &&
    !preparing &&
    !refreshing;
  const canRefresh =
    distributionKind === 'cloud-drive' &&
    onRefresh &&
    row.nodeStatus === 'online' &&
    row.materialization === 'ready' &&
    !preparing &&
    !refreshing;
  return (
    <tr className="border-t" data-testid={`source-host-status-${row.hostId}`}>
      <td className="px-3 py-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">{role}</span>
          {row.availabilityReason === 'excluded' ? (
            <span
              className="text-[10px] text-status-warn"
              data-testid={`source-host-excluded-${row.hostId}`}
            >
              excluded
            </span>
          ) : null}
          {row.availabilityReason === 'needs-remote' ? (
            <span className="text-[10px] text-muted-foreground">needs remote</span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusCell tone={nodeTone(row.nodeStatus)} label={row.nodeStatus} stale={false} />
      </td>
      <td className="px-3 py-2">
        <StatusCell
          tone={materializationTone(row.materialization)}
          label={row.materialization}
          stale={row.stale || row.refreshRequired}
        />
      </td>
      <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">
        {row.lastConfirmedAt ? formatDayTime(row.lastConfirmedAt, timeZone) : '—'}
      </td>
      <td className="break-words px-3 py-2 text-xs leading-snug">{actionError ?? detail}</td>
      <td className="px-3 py-2">
        <AllowedCell
          isOrigin={isOrigin}
          canAllow={canAllow}
          allowed={allowed}
          busy={allowBusy}
          onToggle={onToggleAllowed}
        />
      </td>
      {showActions ? (
        <td className="px-3 py-2">
          <RowActions
            canPrepare={Boolean(canPrepare)}
            canRefresh={Boolean(canRefresh)}
            preparing={Boolean(preparing)}
            refreshing={Boolean(refreshing)}
            ready={row.materialization === 'ready' && !row.refreshRequired}
            hostId={row.hostId}
            onPrepare={onPrepare}
            onRefresh={onRefresh}
          />
        </td>
      ) : null}
    </tr>
  );
}

function RowActions({
  canPrepare,
  canRefresh,
  preparing,
  refreshing,
  ready,
  hostId,
  onPrepare,
  onRefresh,
}: {
  canPrepare: boolean;
  canRefresh: boolean;
  preparing: boolean;
  refreshing: boolean;
  ready: boolean;
  hostId: string;
  onPrepare?: () => void;
  onRefresh?: () => void;
}) {
  if (preparing) {
    return <span className="text-muted-foreground text-xs">Preparing…</span>;
  }
  if (refreshing) {
    return <span className="text-muted-foreground text-xs">Refreshing…</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {canPrepare && onPrepare ? (
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          data-testid={`source-prepare-${hostId}`}
          onClick={onPrepare}
        >
          Prepare
        </button>
      ) : null}
      {canRefresh && onRefresh ? (
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs hover:bg-muted"
          data-testid={`source-refresh-${hostId}`}
          onClick={onRefresh}
        >
          Refresh
        </button>
      ) : null}
      {!canPrepare && !canRefresh ? (
        <span className="text-muted-foreground text-xs">{ready ? 'Ready' : '—'}</span>
      ) : null}
    </div>
  );
}

function StatusCell({
  tone,
  label,
  stale,
}: {
  tone: StatusDotTone;
  label: string;
  stale: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot tone={tone} label={label} />
      <span className="capitalize">
        {label}
        {stale ? ' · stale' : ''}
      </span>
    </span>
  );
}

export function availabilityActionError(input: {
  prepare: { isError: boolean; variables?: string; error: unknown };
  refresh: { isError: boolean; variables?: string; error: unknown };
  availability: { isError: boolean; variables?: string[]; error: unknown };
  hostId: string;
}): string | null {
  const base =
    actionErrorFor(input.prepare, input.hostId) ?? actionErrorFor(input.refresh, input.hostId);
  if (base) {
    return base;
  }
  if (input.availability.isError && input.availability.variables?.includes(input.hostId) === true) {
    return input.availability.error instanceof Error
      ? input.availability.error.message
      : 'Action failed';
  }
  return null;
}

function AllowedCell({
  isOrigin,
  canAllow,
  allowed,
  busy,
  onToggle,
}: {
  isOrigin: boolean;
  canAllow: boolean;
  allowed: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  if (isOrigin) {
    return <Switch checked disabled aria-label="Origin host is always allowed" />;
  }
  if (!canAllow) {
    return (
      <LockIcon
        className="size-3.5 text-muted-foreground"
        aria-label="Add a git remote to allow other hosts"
      />
    );
  }
  return (
    <Switch
      checked={allowed}
      disabled={busy}
      aria-label="Allow this host"
      onCheckedChange={onToggle}
    />
  );
}
