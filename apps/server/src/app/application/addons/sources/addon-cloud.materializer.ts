import { Injectable } from '@harnesys/brix';
import { AddonException } from '../../../domain/addons/errors.ts';
import { AddonCloudBackendPort } from '../../../domain/addons/ports/addon-cloud-backend.port.ts';
import { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../../domain/machine/machine-config.port.ts';
import type { CloudRemoteBackendPort } from '../../../domain/source/cloud-remote-backend.port.ts';
import { CloudSyncBackPort } from '../../../domain/source/cloud-sync-back.port.ts';
import { MaterializationEventsPort } from '../../../domain/source/materialization-events.port.ts';
import { SourceLocationPort } from '../../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../../domain/source/source-materialization.port.ts';
import type { SourceRecord } from '../../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../../domain/source/source-registry.port.ts';
import { materializeCloudSourceOnHost } from '../../source/materialize-cloud-source.ts';
import { addonCloudBackendRefOf, unusedAccessToken } from './addon-source.helpers.ts';

export interface AddonCloudMaterializeOutcome {
  state: 'materializing' | 'ready' | 'failed';
  revision: number;
  errorCode?: string;
  skippedGoogleApps: number;
}

export interface AddonCloudMaterializeResult extends AddonCloudMaterializeOutcome {
  conflicts: string[];
}

/**
 * Shared materialization path for `addon-cloud` sources: the mirror engine stays in the
 * core, the remote backend is the add-on `source.*` bridge, and credentials never leave
 * the add-on.
 */
@Injectable()
export class AddonCloudMaterializer {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly events: MaterializationEventsPort,
    private readonly backends: AddonCloudBackendPort,
    private readonly cloudSync: CloudSyncBackPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
  ) {}

  requireSource(orgId: string, sourceId: string, addonId?: string): SourceRecord {
    const record = this.sources.findById(orgId, sourceId);
    if (record?.distribution.kind !== 'addon-cloud') {
      throw new AddonException('not_found', 404, `add-on cloud source ${sourceId} not found`);
    }
    if (addonId !== undefined && record.distribution.addonId !== addonId) {
      throw new AddonException(
        'not_found',
        404,
        `source ${sourceId} belongs to add-on ${record.distribution.addonId}`,
      );
    }
    return record;
  }

  requireLocalHost(hostId: string): void {
    if (hostId !== this.machine.get().id) {
      throw new AddonException(
        'unsupported',
        409,
        'add-on cloud sources materialize on the host that runs the add-on',
      );
    }
  }

  backendFor(record: SourceRecord): CloudRemoteBackendPort {
    return this.backends.create(addonCloudBackendRefOf(record.distribution, record.orgId));
  }

  async materialize(
    record: SourceRecord,
    hostId: string,
    options?: { force?: boolean },
  ): Promise<AddonCloudMaterializeOutcome> {
    if (record.distribution.kind !== 'addon-cloud') {
      throw new AddonException('invalid_params', 400, 'source is not an add-on cloud source');
    }
    const backend = this.backendFor(record);
    this.recordMaterializingHost(record, hostId);
    const result = await materializeCloudSourceOnHost({
      orgId: record.orgId,
      sourceId: record.id,
      hostId,
      remoteFolderId: record.distribution.remoteFolderId,
      getAccessToken: unusedAccessToken,
      layout: this.layout,
      materializations: this.materializations,
      createBackend: () => backend,
      ...(options?.force === true ? { force: true } : {}),
    });
    const existing = this.materializations.find(record.orgId, record.id, hostId);
    this.materializations.upsertProjection({
      orgId: record.orgId,
      sourceId: record.id,
      hostId,
      state: result.state,
      revision: result.revision,
      lastConfirmedAt: new Date().toISOString(),
      lastErrorCode: result.errorCode ?? null,
      lastConflictPaths: existing?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    this.events.emit({ orgId: record.orgId, sourceId: record.id, hostId });
    return {
      state: result.state === 'absent' ? 'failed' : result.state,
      revision: result.revision,
      errorCode: result.errorCode,
      skippedGoogleApps: result.skippedGoogleApps,
    };
  }

  isReady(orgId: string, sourceId: string, hostId: string): boolean {
    const local = this.materializations.find(orgId, sourceId, hostId);
    const projection = this.materializations.findProjection(orgId, sourceId, hostId);
    return (
      (local?.state === 'ready' && !local.refreshRequired) ||
      (projection?.state === 'ready' && !projection.refreshRequired)
    );
  }

  /**
   * An add-on mirror exists only on the host that runs the add-on, so materializing
   * here is what makes that host allowed for the source.
   */
  private recordMaterializingHost(record: SourceRecord, hostId: string): void {
    if (record.availability.hostIds.includes(hostId)) {
      return;
    }
    this.sources.updateAvailability(record.orgId, record.id, {
      hostIds: [...record.availability.hostIds, hostId],
    });
  }

  async flushLocalEdits(record: SourceRecord): Promise<string[]> {
    if (record.distribution.kind !== 'addon-cloud') {
      throw new AddonException('invalid_params', 400, 'source is not an add-on cloud source');
    }
    const distribution = record.distribution;
    const flushed = await this.cloudSync.flushCloudMirror({
      orgId: record.orgId,
      source: { id: record.id, distribution },
      sourceLocation: this.sourceLocation,
      machine: this.machine,
      getAccessToken: unusedAccessToken,
      createBackend: () => this.backendFor(record),
    });
    return flushed
      .filter((item) => item.status === 'keep-both' && item.conflictPath)
      .map((item) => item.conflictPath as string);
  }
}
