import { siblingRefreshFlag } from '../../domain/source/cloud-materialization-state.ts';
import type { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';

export function markSiblingCloudCopiesRefreshRequired(input: {
  materializations: SourceMaterializationPort;
  materializationEvents: MaterializationEventsPort;
  orgId: string;
  sourceId: string;
  syncedHostId: string;
}): void {
  const now = new Date().toISOString();
  for (const projection of input.materializations.listProjectionsForSource(
    input.orgId,
    input.sourceId,
  )) {
    if (!siblingRefreshFlag(projection.hostId, input.syncedHostId)) {
      continue;
    }
    if (projection.state !== 'ready') {
      continue;
    }
    input.materializations.upsertProjection({
      ...projection,
      revision: projection.revision + 1,
      lastConfirmedAt: now,
      refreshRequired: true,
    });
    input.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: projection.hostId,
    });
  }
  for (const local of input.materializations.listForSource(input.orgId, input.sourceId)) {
    if (!siblingRefreshFlag(local.hostId, input.syncedHostId)) {
      continue;
    }
    if (local.state !== 'ready') {
      continue;
    }
    input.materializations.upsert({
      orgId: local.orgId,
      sourceId: local.sourceId,
      hostId: local.hostId,
      origin: local.origin,
      localPath: local.localPath,
      state: local.state,
      lastError: local.lastError,
      revision: local.revision + 1,
      updatedAt: now,
      lastConflictPaths: local.lastConflictPaths,
      refreshRequired: true,
    });
  }
}
