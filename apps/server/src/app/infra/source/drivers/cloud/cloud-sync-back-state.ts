import { markSiblingCloudCopiesRefreshRequired } from '../../../../application/source/mark-cloud-siblings-refresh.ts';
import { applyCloudSyncOutcome } from '../../../../domain/source/cloud-materialization-state.ts';
import { MaterializationEventsPort } from '../../../../domain/source/materialization-events.port.ts';
import { SourceMaterializationPort } from '../../../../domain/source/source-materialization.port.ts';
import type { SyncBackResult } from './cloud-mirror-engine.ts';
import type { CloudSyncStateFrame } from './cloud-sync-back.ts';

interface CloudSyncStateDependencies {
  materializations: SourceMaterializationPort;
  materializationEvents: MaterializationEventsPort;
  orgId: string;
  sourceId: string;
  hostId: string;
}

interface CloudSyncResultInput extends CloudSyncStateDependencies {
  result: SyncBackResult;
}

export function recordCloudSyncResult(
  input: CloudSyncResultInput,
): { frame: CloudSyncStateFrame; sourceChanged: boolean } | null {
  const current = input.materializations.find(input.orgId, input.sourceId, input.hostId);
  if (!current) {
    return null;
  }
  const next = applyCloudSyncOutcome(
    {
      state: current.state,
      lastConflictPaths: current.lastConflictPaths,
      errorCode: current.lastError,
      refreshRequired: current.refreshRequired,
    },
    input.result.status,
    input.result.conflictPath,
  );
  const updatedAt = new Date().toISOString();
  const revision = current.revision + 1;
  input.materializations.upsert({
    ...current,
    state: next.state,
    lastError: next.errorCode,
    revision,
    updatedAt,
    lastConflictPaths: next.lastConflictPaths,
    refreshRequired: next.refreshRequired,
  });
  input.materializations.upsertProjection({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
    state: next.state,
    revision,
    lastConfirmedAt: updatedAt,
    lastErrorCode: next.errorCode,
    lastConflictPaths: next.lastConflictPaths,
    refreshRequired: next.refreshRequired,
  });
  input.materializationEvents.emit({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
  });
  const sourceChanged = input.result.status !== 'revision-unknown';
  if (sourceChanged) {
    markSiblingCloudCopiesRefreshRequired({
      materializations: input.materializations,
      materializationEvents: input.materializationEvents,
      orgId: input.orgId,
      sourceId: input.sourceId,
      syncedHostId: input.hostId,
    });
  }
  return {
    frame: {
      sourceId: input.sourceId,
      hostId: input.hostId,
      revision,
      state: next.state === 'failed' ? 'failed' : 'ready',
      ...(next.errorCode ? { lastErrorCode: next.errorCode } : {}),
      lastConflictPaths: next.lastConflictPaths,
      refreshRequired: next.refreshRequired,
    },
    sourceChanged,
  };
}

export function recordCloudSyncFailure(
  input: CloudSyncStateDependencies,
): CloudSyncStateFrame | null {
  const current = input.materializations.find(input.orgId, input.sourceId, input.hostId);
  if (!current) {
    return null;
  }
  const revision = current.revision + 1;
  const updatedAt = new Date().toISOString();
  input.materializations.upsert({
    ...current,
    lastError: 'CLOUD_SYNC_FAILED',
    revision,
    updatedAt,
    refreshRequired: true,
  });
  input.materializations.upsertProjection({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
    state: current.state,
    revision,
    lastConfirmedAt: updatedAt,
    lastErrorCode: 'CLOUD_SYNC_FAILED',
    lastConflictPaths: current.lastConflictPaths,
    refreshRequired: true,
  });
  input.materializationEvents.emit({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
  });
  return {
    sourceId: input.sourceId,
    hostId: input.hostId,
    revision,
    state: current.state === 'ready' ? 'ready' : 'failed',
    lastErrorCode: 'CLOUD_SYNC_FAILED',
    lastConflictPaths: current.lastConflictPaths,
    refreshRequired: true,
  };
}
