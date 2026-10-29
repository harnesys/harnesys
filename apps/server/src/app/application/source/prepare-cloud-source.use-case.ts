import { randomUUID } from 'node:crypto';
import { Injectable } from '@harnesys/brix';
import type { PrepareGitSourceResponse } from '@harnesys/contracts';
import { HostOfflineException } from '../../domain/content/content.error.ts';
import { FleetHubPort } from '../../domain/fleet/fleet-hub.port.ts';
import { NodeCommandQueuePort } from '../../domain/fleet/node-command-queue.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
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
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { materializeCloudSourceOnHost } from './materialize-cloud-source.ts';

const GRANT_TTL_MS = 5 * 60_000;

export interface PrepareCloudSourceInput {
  orgId: string;
  sourceId: string;
  hostId: string;
}

interface CloudDriveSourceConfig {
  remoteFolderId: string;
  integrationId: string;
}

@Injectable()
export class PrepareCloudSourceUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly grants: SourceOperationGrantPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly integrations: IntegrationRegistryPort,
    private readonly tokens: IntegrationTokenPort,
    private readonly nodes: NodeRepository,
    private readonly commands: NodeCommandQueuePort,
    private readonly hub: FleetHubPort,
    private readonly revisions: OrgConfigRevisionPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly cloudSyncBackWatcher: CloudSyncBackWatchPort,
  ) {}

  async execute(input: PrepareCloudSourceInput): Promise<PrepareGitSourceResponse> {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (row.distribution.kind !== 'cloud-drive') {
      throw new SourceDriverMismatchException(input.sourceId, 'cloud-drive', row.distribution.kind);
    }
    const node = this.nodes.findById(input.orgId, input.hostId);
    if (!node) {
      throw new SourcePathInvalidException(`unknown host: ${input.hostId}`);
    }
    const existing = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    const existingProjection = this.materializations.findProjection(
      input.orgId,
      input.sourceId,
      input.hostId,
    );
    if (
      (existing?.state === 'ready' && !existing.refreshRequired) ||
      (existingProjection?.state === 'ready' && !existingProjection.refreshRequired)
    ) {
      return {
        sourceId: input.sourceId,
        hostId: input.hostId,
        operationId: randomUUID(),
        state: 'ready',
        worktreeId: null,
      };
    }
    const operationId = randomUUID();
    const sourceRevision = this.revisions.get(input.orgId).revision;
    const now = new Date().toISOString();
    const nextRevision = Math.max(existing?.revision ?? 0, existingProjection?.revision ?? 0) + 1;
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: 'materializing',
      revision: nextRevision,
      lastConfirmedAt: now,
      lastErrorCode: null,
      lastConflictPaths: existing?.lastConflictPaths ?? existingProjection?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    const localHostId = this.machineConfig.get().id;
    if (input.hostId === localHostId) {
      return this.prepareLocal(input, row.distribution, operationId);
    }
    if (!this.hub.hasPeer(input.hostId)) {
      throw new HostOfflineException(input.hostId);
    }
    const integration = this.integrations.findById(input.orgId, row.distribution.integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, row.distribution.integrationId);
    }
    this.grants.create({
      operationId,
      orgId: input.orgId,
      nodeId: input.hostId,
      sourceId: input.sourceId,
      credRef: integration.credRef,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
    });
    const command: WorkerCommand = {
      type: 'SOURCE_MATERIALIZE',
      operationId,
      sourceId: input.sourceId,
      sourceRevision,
      projectionRevision: nextRevision,
      secretName: integration.credRef,
    };
    this.commands.enqueue(input.orgId, input.hostId, command);
    this.hub.routeCommand(input.hostId, command);
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      operationId,
      state: 'materializing',
      worktreeId: null,
    };
  }

  private async prepareLocal(
    input: PrepareCloudSourceInput,
    source: CloudDriveSourceConfig,
    operationId: string,
  ): Promise<PrepareGitSourceResponse> {
    const existing = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    const result = await materializeCloudSourceOnHost({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      remoteFolderId: source.remoteFolderId,
      getAccessToken: () => this.tokens.getAccessToken(input.orgId, source.integrationId),
      layout: this.layout,
      materializations: this.materializations,
    });
    this.materializations.upsertProjection({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      state: result.state,
      revision: result.revision,
      lastConfirmedAt: new Date().toISOString(),
      lastErrorCode: result.errorCode ?? null,
      lastConflictPaths: existing?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    this.materializationEvents.emit({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
    });
    if (result.state === 'ready') {
      this.cloudSyncBackWatcher.syncOrg(input.orgId);
    }
    return {
      sourceId: input.sourceId,
      hostId: input.hostId,
      operationId,
      state: result.state,
      worktreeId: null,
    };
  }
}
