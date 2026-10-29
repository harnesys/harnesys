import type { FleetNode } from '@harnesys/contracts';
import { Loader2Icon, RefreshCwIcon, UnplugIcon } from 'lucide-react';
import { useOrgTimeZone } from '@/features/switch-org/org-time-zone';
import { formatDayTime } from '@/shared/lib/format-clock';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RowChip } from '@/shared/ui/capability-rows';
import { SettingsEmpty, SettingsSection } from '@/shared/ui/settings-kit';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  configSyncChip,
  configSyncLabel,
  formatDisk,
  hostRailClass,
  hostStatusChip,
  hostStatusLabel,
  resolveConfigSync,
  resolveHostStatus,
} from './fleet-host-status';

export type FleetDeskRole = 'relay' | 'worker';

interface FleetHostsSectionProps {
  nodes: FleetNode[];
  deskRole: FleetDeskRole;
  localNodeId: string | null;
  loading?: boolean;
  actionBusyId?: string | null;
  onIssueInvite?: () => void;
  onDisconnect?: (node: FleetNode) => void;
  onRotate?: (node: FleetNode) => void;
  onRemove?: (node: FleetNode) => void;
  onLeave?: (node: FleetNode) => void;
}

export function FleetHostsSection({
  nodes,
  deskRole,
  localNodeId,
  loading = false,
  actionBusyId = null,
  onIssueInvite,
  onDisconnect,
  onRotate,
  onRemove,
  onLeave,
}: FleetHostsSectionProps) {
  const timeZone = useOrgTimeZone();
  return (
    <SettingsSection
      label="Hosts"
      count={loading ? undefined : nodes.length}
      description="Machines in this organization and what they are doing right now."
      testId="fleet-nodes"
    >
      {loading ? <HostsListSkeleton /> : null}

      {!loading && nodes.length === 0 ? (
        <SettingsEmpty
          title={deskRole === 'relay' ? 'No hosts yet' : 'Waiting for hosts'}
          description={
            deskRole === 'relay'
              ? 'Issue an invite, then join from another machine to grow the fleet.'
              : 'Hosts appear here once the relay shares the fleet snapshot.'
          }
          action={
            deskRole === 'relay' && onIssueInvite ? (
              <Button type="button" onClick={onIssueInvite} data-testid="fleet-hosts-empty-invite">
                Issue invite
              </Button>
            ) : undefined
          }
          testId="fleet-hosts-empty"
        />
      ) : null}

      {!loading && nodes.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border/60">
          {nodes.map((node) => {
            const isSelf = localNodeId !== null && node.id === localNodeId;
            const busy = actionBusyId === node.id;
            const status = resolveHostStatus(node);
            const sync = resolveConfigSync(node);
            const disk = formatDisk(node.diskFreeBytes, node.diskTotalBytes);
            return (
              <li
                key={node.id}
                className="relative grid gap-3 py-3 ps-3 pe-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-3 bottom-3 left-0 w-0.5 rounded-r-full',
                    hostRailClass(status),
                  )}
                />

                <div className="min-w-0 pl-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-sm">{node.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {node.role === 'relay' ? 'Server' : 'Worker'}
                    </span>
                    {isSelf ? <RowChip tone="info">This machine</RowChip> : null}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <RowChip tone={hostStatusChip(status)} testId={`node-status-${node.id}`}>
                      {hostStatusLabel(status)}
                    </RowChip>
                    <RowChip tone={configSyncChip(sync)} testId={`node-config-${node.id}`}>
                      <span title={node.syncReason ?? undefined}>{configSyncLabel(sync)}</span>
                    </RowChip>
                    {node.activeClaims > 0 ? (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {node.activeClaims} active {node.activeClaims === 1 ? 'run' : 'runs'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Idle</span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {disk ? <span className="tabular-nums">{disk}</span> : null}
                    <span>
                      Seen {node.lastSeenAt ? formatDayTime(node.lastSeenAt, timeZone) : 'never'}
                    </span>
                  </div>
                </div>

                <HostActions
                  node={node}
                  deskRole={deskRole}
                  isSelf={isSelf}
                  busy={busy}
                  onDisconnect={onDisconnect}
                  onRotate={onRotate}
                  onRemove={onRemove}
                  onLeave={onLeave}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </SettingsSection>
  );
}

interface HostActionsProps {
  node: FleetNode;
  deskRole: FleetDeskRole;
  isSelf: boolean;
  busy: boolean;
  onDisconnect?: (node: FleetNode) => void;
  onRotate?: (node: FleetNode) => void;
  onRemove?: (node: FleetNode) => void;
  onLeave?: (node: FleetNode) => void;
}

function HostActions({
  node,
  deskRole,
  isSelf,
  busy,
  onDisconnect,
  onRotate,
  onRemove,
  onLeave,
}: HostActionsProps) {
  if (deskRole === 'relay' && node.role === 'worker' && !isSelf) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-1 sm:pl-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onDisconnect?.(node)}
          data-testid={`fleet-disconnect-${node.id}`}
        >
          {busy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <UnplugIcon className="size-3.5" />
          )}
          Disconnect
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onRotate?.(node)}
          data-testid={`fleet-rotate-${node.id}`}
        >
          <RefreshCwIcon className="size-3.5" />
          Rotate token
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => onRemove?.(node)}
          data-testid={`fleet-remove-${node.id}`}
        >
          Remove
        </Button>
      </div>
    );
  }

  if (deskRole === 'worker' && isSelf) {
    return (
      <div className="flex justify-end sm:pl-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={() => onLeave?.(node)}
          data-testid={`fleet-leave-${node.id}`}
        >
          {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
          Leave organization
        </Button>
      </div>
    );
  }

  return null;
}

function HostsListSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border/60" data-testid="fleet-hosts-skeleton">
      {Array.from({ length: 3 }, (_, row) => (
        <div key={`row-${row}`} className="flex items-start gap-3 py-3.5 ps-3">
          <Skeleton className="mt-1 h-8 w-0.5 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-2">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-4 w-14 rounded" />
            </div>
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
