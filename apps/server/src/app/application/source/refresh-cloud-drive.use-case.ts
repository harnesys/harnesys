import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { OrgConfigRevisionPort } from '../../domain/fleet/org-config-revision.port.ts';
import type { WorkerCommand } from '../../domain/fleet/worker-command.ts';
import { IntegrationNotFoundException } from '../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { IntegrationTokenPort } from '../../domain/integration/integration-token.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { CloudSyncBackWatchPort } from '../../domain/source/cloud-sync-back-watch.port.ts';
import { MaterializationEventsPort } from '../../domain/source/materialization-events.port.ts';
import {
  SourceDriverMismatchException,
  SourceMaterializationAbsentException,
  SourceNotFoundException,
} from '../../domain/source/source.error.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { flushCloudMirror } from '../../infra/source/drivers/cloud/cloud-sync-back.ts';
import { markSiblingCloudCopiesRefreshRequired } from './mark-cloud-siblings-refresh.ts';
import { materializeCloudSourceOnHost } from './materialize-cloud-source.ts';
import { toPublicSource } from './to-public-source.ts';

const GRANT_TTL_MS = 5 * 60_000;

export interface RefreshCloudDriveInput {
  orgId: string;
  sourceId: string;
  hostId: string;
}

export interface RefreshCloudDriveResult {
  source: Source;
  skippedGoogleApps: number;
  state: 'materializing' | 'ready' | 'failed';
  conflicts: string[];
}

@Injectable()
export class RefreshCloudDriveUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly integrations: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
    private readonly grants: SourceOperationGrantPort,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly cloudSyncBackWatcher: CloudSyncBackWatchPort,
    private readonly sourceLocation: SourceLocationPort,
  ) {}

  async execute(input: RefreshCloudDriveInput): Promise<RefreshCloudDriveResult> {
    const record = this.sources.findById(input.orgId, input.sourceId);
    if (!record) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (record.distribution.kind !== 'cloud-drive') {
      throw new SourceDriverMismatchException(
        input.sourceId,
        'cloud-drive',
        record.distribution.kind,
      );
    }
    const distribution = record.distribution;
    const localHostId = this.machineConfig.get().id;
    if (input.hostId !== localHostId) {
      return this.refreshRemote(input, distribution.integrationId);
    }
    const materialization = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    if (!materialization || materialization.state === 'absent') {
      throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
    }
    const conflicts = await this.flushLocalEdits(input, distribution);
    const result = await materializeCloudSourceOnHost({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      remoteFolderId: distribution.remoteFolderId,
      getAccessToken: () => this.tokens.getAccessToken(input.orgId, distribution.integrationId),
      layout: this.layout,
      materializations: this.materializations,
      force: true,
    });
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: result.state,
      revision: result.revision,
      lastConfirmedAt: new Date().toISOString(),
      lastErrorCode: result.errorCode ?? null,
      lastConflictPaths: materialization.lastConflictPaths,
      refreshRequired: false,
    });
    if (result.state === 'ready') {
      this.cloudSyncBackWatcher.syncOrg(input.orgId);
      markSiblingCloudCopiesRefreshRequired({
        materializations: this.materializations,
        materializationEvents: this.materializationEvents,
        orgId: input.orgId,
        sourceId: input.sourceId,
        syncedHostId: input.hostId,
      });
    }
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    return {
      source: toPublicSource(record, new Date().toISOString()),
      skippedGoogleApps: result.skippedGoogleApps,
      state: result.state === 'absent' ? 'failed' : result.state,
      conflicts,
    };
  }

  private async flushLocalEdits(
    input: RefreshCloudDriveInput,
    distribution: { kind: 'cloud-drive'; remoteFolderId: string; integrationId: string },
  ): Promise<string[]> {
    const flushed = await flushCloudMirror({
      orgId: input.orgId,
      source: {
        id: input.sourceId,
        distribution: {
          kind: 'cloud-drive',
          remoteFolderId: distribution.remoteFolderId,
          integrationId: distribution.integrationId,
        },
      },
      sourceLocation: this.sourceLocation,
      machine: this.machineConfig,
      getAccessToken: () => this.tokens.getAccessToken(input.orgId, distribution.integrationId),
    });
    return flushed
      .filter((item) => item.status === 'keep-both' && item.conflictPath)
      .map((item) => item.conflictPath as string);
  }

  private refreshRemote(
    input: RefreshCloudDriveInput,
    integrationId: string,
  ): RefreshCloudDriveResult {
    const integration = this.integrations.findById(input.orgId, integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, integrationId);
    }
    const credRef = integration.credRef;
    if (!this.hub.hasPeer(input.hostId)) {
      throw new HostOfflineException(input.hostId);
    }
    const existing = this.materializations.findProjection(
      input.orgId,
      input.sourceId,
      input.hostId,
    );
    const operationId = randomUUID();
    const sourceRevision = this.revisions.get(input.orgId).revision;
    const nextRevision = (existing?.revision ?? 0) + 1;
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: 'materializing',
      revision: nextRevision,
      lastConfirmedAt: new Date().toISOString(),
      lastErrorCode: null,
      lastConflictPaths: existing?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    this.grants.create({
      operationId,
      orgId: input.orgId,
      nodeId: input.hostId,
      sourceId: input.sourceId,
      credRef,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
    });
    const command: WorkerCommand = {
      type: 'SOURCE_REFRESH',
      operationId,
      sourceId: input.sourceId,
      sourceRevision,
      projectionRevision: nextRevision,
      secretName: credRef,
    };
    this.commands.enqueue(input.orgId, input.hostId, command);
    this.hub.routeCommand(input.hostId, command);
    const record = this.sources.findById(input.orgId, input.sourceId);
    if (!record) {
      throw new SourceNotFoundException(input.sourceId);
    }
    return {
      source: toPublicSource(record),
      skippedGoogleApps: 0,
      state: 'materializing',
      conflicts: [],
    };
  }
}
