import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@harnesys/brix';
import type { ContentWriteResponse } from '@harnesys/contracts';
import { OrgContentPort } from '../../domain/content/org-content.port.ts';
import { SourceWriteLeasePort } from '../../domain/fleet/source-write-lease.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { applyCloudSyncOutcome } from '../../domain/source/cloud-materialization-state.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { syncBackCloudFile } from '../../infra/source/drivers/cloud/cloud-sync-back.ts';
import { markSiblingCloudCopiesRefreshRequired } from '../source/mark-cloud-siblings-refresh.ts';

const WRITE_LEASE_TTL_MS = 60_000;

export interface WriteFileInput {
  orgId: string;
  sourceId: string;
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  ifMatch?: string | null;
  worktreeId?: string;
}

@Injectable()
export class WriteFileUseCase {
  private readonly log: Logger;

  constructor(
    private readonly content: OrgContentPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
    private readonly tokens: IntegrationTokenPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly writeLeases: SourceWriteLeasePort,
    logger: Logger,
  ) {
    this.log = logger.child('write-file');
  }

  async execute(input: WriteFileInput): Promise<ContentWriteResponse> {
    const bytes =
      input.encoding === 'base64'
        ? Uint8Array.from(Buffer.from(input.content, 'base64'))
        : new TextEncoder().encode(input.content);
    const result = await this.content.write(input.orgId, input.sourceId, input.path, bytes, {
      ifMatch: input.ifMatch,
      worktreeId: input.worktreeId,
    });
    await this.maybeSyncCloud(input.orgId, input.sourceId, input.path);
    return { path: input.path, etag: result.etag };
  }

  private async maybeSyncCloud(orgId: string, sourceId: string, path: string): Promise<void> {
    const record = this.sources.findById(orgId, sourceId);
    const distribution = record?.distribution;
    if (distribution?.kind !== 'cloud-drive') {
      return;
    }
    const hostId = this.machine.get().id;
    const runId = randomUUID();
    const lease = this.writeLeases.acquire({
      orgId,
      sourceId,
      runId,
      nodeId: hostId,
      expiresAt: new Date(Date.now() + WRITE_LEASE_TTL_MS).toISOString(),
    });
    if (!lease.ok) {
      return;
    }
    try {
      const syncResult = await syncBackCloudFile(
        {
          sources: this.sources,
          sourceLocation: this.sourceLocation,
          machine: this.machine,
          getAccessToken: () => this.tokens.getAccessToken(orgId, distribution.integrationId),
        },
        orgId,
        sourceId,
        path,
      );
      if (!syncResult) {
        return;
      }
      const existing = this.materializations.find(orgId, sourceId, hostId);
      if (!existing) {
        return;
      }
      const next = applyCloudSyncOutcome(
        {
          state: existing.state,
          lastConflictPaths: existing.lastConflictPaths,
          errorCode: existing.lastError,
          refreshRequired: existing.refreshRequired,
        },
        syncResult.status,
        syncResult.conflictPath,
      );
      const revision = existing.revision + 1;
      const updatedAt = new Date().toISOString();
      this.materializations.upsert({
        orgId,
        sourceId,
        hostId,
        origin: existing.origin,
        localPath: existing.localPath,
        state: next.state,
        lastError: next.errorCode,
        revision,
        updatedAt,
        lastConflictPaths: next.lastConflictPaths,
        refreshRequired: next.refreshRequired,
      });
      this.materializations.upsertProjection({
        orgId,
        sourceId,
        hostId,
        state: next.state,
        revision,
        lastConfirmedAt: updatedAt,
        lastErrorCode: next.errorCode,
        lastConflictPaths: next.lastConflictPaths,
        refreshRequired: next.refreshRequired,
      });
      this.materializationEvents.emit({ orgId, sourceId, hostId });
      if (syncResult.status === 'uploaded' || syncResult.status === 'keep-both') {
        markSiblingCloudCopiesRefreshRequired({
          materializations: this.materializations,
          materializationEvents: this.materializationEvents,
          orgId,
          sourceId,
          syncedHostId: hostId,
        });
      }
    } catch (err) {
      this.log.warn(
        { orgId, sourceId, path, err: err instanceof Error ? err.message : String(err) },
        'cloud sync failed after local write',
      );
      const existing = this.materializations.find(orgId, sourceId, hostId);
      if (existing) {
        const revision = existing.revision + 1;
        const updatedAt = new Date().toISOString();
        this.materializations.upsert({
          ...existing,
          state: existing.state,
          lastError: 'CLOUD_SYNC_FAILED',
          revision,
          updatedAt,
          refreshRequired: true,
        });
        this.materializations.upsertProjection({
          orgId,
          sourceId,
          hostId,
          state: existing.state,
          revision,
          lastConfirmedAt: updatedAt,
          lastErrorCode: 'CLOUD_SYNC_FAILED',
          lastConflictPaths: existing.lastConflictPaths,
          refreshRequired: true,
        });
        this.materializationEvents.emit({ orgId, sourceId, hostId });
      }
    } finally {
      this.writeLeases.release(orgId, sourceId, runId);
    }
  }
}
