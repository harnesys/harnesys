import { Injectable } from '@harnesys/brix';
import type {
  SourceHostNodeStatus,
  SourceHostStatus,
  SourceHostStatusResponse,
} from '@harnesys/contracts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import {
  type MaterializationStatusView,
  mergeSourceHostStatus,
} from '../../domain/source/source-host-status.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { isSourceVisibleToSurface } from '../../domain/source/ui-visibility.policy.ts';
import { sourceHostAvailability } from '../../domain/source/vcs-capability.ts';

export interface GetSourceHostStatusInput {
  orgId: string;
  sourceId: string;
  surfaceHostId: string | null;
}

@Injectable()
export class GetSourceHostStatusUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly hub: FleetHubPort,
  ) {}

  execute(input: GetSourceHostStatusInput): SourceHostStatusResponse {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row || !isSourceVisibleToSurface(row, input.surfaceHostId)) {
      throw new SourceNotFoundException(input.sourceId);
    }
    const presence = new Map(
      this.hub.listPresence(input.orgId).map((node) => [node.id, node.status] as const),
    );
    const projections = this.materializations.listProjectionsForSource(input.orgId, input.sourceId);
    const locals = this.materializations.listForSource(input.orgId, input.sourceId);
    const views = new Map<string, MaterializationStatusView>();
    for (const local of locals) {
      views.set(local.hostId, {
        state: local.state,
        lastConfirmedAt: local.updatedAt,
        errorCode: local.lastError,
        defaultWorktreeId: local.localPath ? basenameId(local.localPath) : null,
        lastConflictPaths: local.lastConflictPaths,
        refreshRequired: local.refreshRequired,
      });
    }
    for (const projection of projections) {
      const prior = views.get(projection.hostId);
      views.set(projection.hostId, {
        state: projection.state,
        lastConfirmedAt: projection.lastConfirmedAt,
        errorCode: projection.lastErrorCode,
        defaultWorktreeId: prior?.defaultWorktreeId ?? null,
        lastConflictPaths: projection.lastConflictPaths,
        refreshRequired: projection.refreshRequired,
      });
    }
    const hostIdSet = new Set<string>();
    if (row.distribution.kind === 'host-bound') {
      hostIdSet.add(row.distribution.hostId);
    }
    for (const hostId of row.availability.hostIds) {
      hostIdSet.add(hostId);
    }
    for (const hostId of presence.keys()) {
      hostIdSet.add(hostId);
    }
    for (const hostId of views.keys()) {
      hostIdSet.add(hostId);
    }
    const statuses: SourceHostStatus[] = [...hostIdSet].sort().map((hostId) => {
      const nodeStatus: SourceHostNodeStatus = presence.get(hostId) ?? 'offline';
      const merged = mergeSourceHostStatus(hostId, nodeStatus, views.get(hostId) ?? null);
      return { ...merged, availabilityReason: sourceHostAvailability(row, hostId).reason };
    });
    return { statuses };
  }
}

function basenameId(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
