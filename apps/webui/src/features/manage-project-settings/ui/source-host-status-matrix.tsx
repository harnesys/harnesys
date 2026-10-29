import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { fleetNodesQuery, watchFleetChanged, watchMaterializationChanged } from '@/shared/api';
import {
  listSources,
  prepareGitSource,
  refreshCloudDrive,
  sourceHostStatusQuery,
  sourceHostStatusQueryKey,
  updateSourceAvailability,
} from '@/shared/api/sources';
import { availabilityActionError, HostStatusRow } from './source-host-status-row';

interface SourceHostStatusMatrixProps {
  orgId: string;
  sourceId: string;
  distributionKind: 'host-bound' | 'cloud-drive';
  hasRemote: boolean;
  originHostId: string | null;
}

export function SourceHostStatusMatrix({
  orgId,
  sourceId,
  distributionKind,
  hasRemote,
  originHostId,
}: SourceHostStatusMatrixProps) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery(sourceHostStatusQuery(orgId, sourceId));
  const sourcesQuery = useQuery({
    queryKey: ['sources', orgId],
    queryFn: () => listSources(orgId),
    enabled: Boolean(orgId),
  });
  const source = sourcesQuery.data?.sources.find((item) => item.id === sourceId) ?? null;
  const allowlist = source?.availability.hostIds ?? [];
  const { data: nodes = [] } = useQuery(fleetNodesQuery);
  const [live, setLive] = useState(false);
  const prepareMutation = useMutation({
    mutationFn: (hostId: string) => prepareGitSource(orgId, sourceId, hostId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sourceHostStatusQueryKey(orgId, sourceId) });
    },
  });
  const refreshMutation = useMutation({
    mutationFn: (hostId: string) => refreshCloudDrive(orgId, sourceId, hostId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sourceHostStatusQueryKey(orgId, sourceId) });
    },
  });
  const availabilityMutation = useMutation({
    mutationFn: (hostIds: string[]) => updateSourceAvailability(orgId, sourceId, hostIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sources', orgId] });
      void queryClient.invalidateQueries({ queryKey: sourceHostStatusQueryKey(orgId, sourceId) });
    },
  });
  const showActions = distributionKind === 'cloud-drive' || hasRemote;

  useEffect(() => {
    if (!orgId || !sourceId) {
      return;
    }
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: sourceHostStatusQueryKey(orgId, sourceId) });
    };
    const stopFleet = watchFleetChanged(orgId, invalidate, {
      onOpen: () => {
        setLive(true);
        invalidate();
      },
      onError: () => {
        setLive(false);
      },
    });
    const stopMat = watchMaterializationChanged(
      orgId,
      (frame) => {
        if (frame.sourceId === sourceId) {
          invalidate();
        }
      },
      {
        onOpen: () => {
          setLive(true);
        },
        onError: () => {
          setLive(false);
        },
      },
    );
    return () => {
      stopFleet();
      stopMat();
    };
  }, [orgId, sourceId, queryClient]);

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const statuses = statusQuery.data?.statuses ?? [];

  return (
    <section className="flex flex-col gap-3" data-testid="source-host-status-matrix">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium text-sm">Availability by node</h2>
        <span className="text-muted-foreground text-xs">{live ? 'Live' : 'Reconnect pending'}</span>
      </div>
      {distributionKind === 'host-bound' ? (
        <p className="text-muted-foreground text-xs">
          The origin host is always allowed. Other hosts can clone only when a git remote is set —
          toggle them in the Allowed column.
        </p>
      ) : null}
      {distributionKind === 'cloud-drive' ? (
        <p className="text-muted-foreground text-xs">
          Cloud copies are independent mirrors. Refresh pulls provider changes; conflicts keep both
          versions.
        </p>
      ) : null}
      {statusQuery.isError ? (
        <p className="text-destructive text-xs">
          {statusQuery.error instanceof Error
            ? statusQuery.error.message
            : 'Failed to load host status'}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <th className="px-3 py-2">Node</th>
              <th className="px-3 py-2">Presence</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Confirmed</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Allowed</th>
              {showActions ? <th className="px-3 py-2">Action</th> : null}
            </tr>
          </thead>
          <tbody>
            {statuses.map((row) => (
              <HostStatusRow
                key={row.hostId}
                row={row}
                node={nodeById.get(row.hostId)}
                distributionKind={distributionKind}
                showActions={showActions}
                isOrigin={row.hostId === originHostId}
                canAllow={distributionKind === 'cloud-drive' || hasRemote}
                allowed={allowlist.includes(row.hostId)}
                allowBusy={
                  availabilityMutation.isPending &&
                  availabilityMutation.variables?.includes(row.hostId) === true
                }
                onToggleAllowed={(next) => {
                  const nextIds = next
                    ? [...allowlist, row.hostId]
                    : allowlist.filter((id) => id !== row.hostId);
                  availabilityMutation.mutate(nextIds);
                }}
                preparing={prepareMutation.isPending && prepareMutation.variables === row.hostId}
                refreshing={refreshMutation.isPending && refreshMutation.variables === row.hostId}
                onPrepare={
                  showActions
                    ? () => {
                        prepareMutation.mutate(row.hostId);
                      }
                    : undefined
                }
                onRefresh={
                  distributionKind === 'cloud-drive'
                    ? () => {
                        refreshMutation.mutate(row.hostId);
                      }
                    : undefined
                }
                actionError={availabilityActionError({
                  prepare: prepareMutation,
                  refresh: refreshMutation,
                  availability: availabilityMutation,
                  hostId: row.hostId,
                })}
              />
            ))}
            {statuses.length === 0 && !statusQuery.isPending ? (
              <tr>
                <td className="px-3 py-3 text-muted-foreground" colSpan={showActions ? 7 : 6}>
                  No node materialization known yet
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
