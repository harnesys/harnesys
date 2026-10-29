import { Configuration, Injectable } from '@harnesys/brix';
import type { AppConfig } from '../../../../../config.schema.ts';
import { SourceWriteLeasePort } from '../../../../domain/fleet/source-write-lease.port.ts';
import { IntegrationTokenPort } from '../../../../domain/integration/integration-token.port.ts';
import { FilesWatcherPort } from '../../../../domain/knowledge/files-watcher.port.ts';
import { MachineConfigPort } from '../../../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../../../domain/machine/org-machine-store.port.ts';
import { SecretStorePort } from '../../../../domain/secret/secret-store.port.ts';
import { CloudSyncBackWatchPort } from '../../../../domain/source/cloud-sync-back-watch.port.ts';
import { MaterializationEventsPort } from '../../../../domain/source/materialization-events.port.ts';
import { SourceLocationPort } from '../../../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../../../domain/source/source-registry.port.ts';
import { trace } from '../../../../libs/trace.ts';
import { type GoogleOAuthClientConfig } from '../../../integration/google/google-oauth-device.ts';
import { googleCredKey } from '../../../integration/google/google-token-access.ts';
import { scanCloudMirrorChanges } from './cloud-mirror-scan.ts';
import {
  type CloudChangeKind,
  type CloudDriveSyncSource,
  type CloudSyncStateFrame,
  syncBackCloudPath,
} from './cloud-sync-back.ts';
import type { PendingCloudChange } from './cloud-sync-back-queue.ts';
import { CloudSyncBackQueue } from './cloud-sync-back-queue.ts';
import { recordCloudSyncFailure, recordCloudSyncResult } from './cloud-sync-back-state.ts';
import { type CloudSyncCredentialLease, leasedTokenReader } from './cloud-sync-back-tokens.ts';

export { coalescePaths } from './cloud-sync-back-queue.ts';

const SYNC_LEASE_TTL_MS = 60_000;

interface CloudWatchContext {
  source: CloudDriveSyncSource;
  resolveCredential?: () => Promise<CloudSyncCredentialLease>;
  resolveAccessToken?: () => Promise<string>;
  onSync?: (frame: CloudSyncStateFrame, sourceChanged: boolean) => void;
  leasedClient?: { client?: GoogleOAuthClientConfig };
}

interface CloudSyncWatchOptions {
  resolveCredential?: (source: CloudDriveSyncSource) => Promise<CloudSyncCredentialLease>;
  resolveAccessToken?: (source: CloudDriveSyncSource) => Promise<string>;
  onSync?: (frame: CloudSyncStateFrame, sourceChanged: boolean) => void;
  reconcile?: boolean;
}

@Injectable()
export class CloudSyncBackWatcher extends CloudSyncBackWatchPort {
  private readonly stops = new Map<string, Map<string, () => void>>();
  private readonly contexts = new Map<string, Map<string, CloudWatchContext>>();
  private readonly queue: CloudSyncBackQueue;

  constructor(
    private readonly filesWatcher: FilesWatcherPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly secrets: SecretStorePort,
    private readonly orgs: OrgMachineStore,
    private readonly machine: MachineConfigPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly materializationEvents: MaterializationEventsPort,
    private readonly writeLeases: SourceWriteLeasePort,
    private readonly tokens: IntegrationTokenPort,
    @Configuration() readonly _appConfig: AppConfig,
  ) {
    super();
    this.queue = new CloudSyncBackQueue((change) => this.processQueuedChange(change));
  }

  onModuleInit(): void {
    for (const entry of this.orgs.list()) {
      this.syncOrg(entry.orgId);
    }
  }

  syncOrg(orgId: string): void {
    const sources = this.sources.list(orgId).flatMap((source) => {
      if (source.distribution.kind !== 'cloud-drive') {
        return [];
      }
      return [
        {
          id: source.id,
          distribution: {
            kind: 'cloud-drive' as const,
            remoteFolderId: source.distribution.remoteFolderId,
            integrationId: source.distribution.integrationId,
          },
        },
      ];
    });
    this.syncSources(orgId, sources, {
      resolveAccessToken: (source) =>
        this.tokens.getAccessToken(orgId, source.distribution.integrationId),
      reconcile: true,
    });
  }

  syncSources(
    orgId: string,
    sources: readonly CloudDriveSyncSource[],
    options?: CloudSyncWatchOptions,
  ): void {
    const hostId = this.machine.get().id;
    const sourceStops = this.stops.get(orgId) ?? new Map<string, () => void>();
    const sourceContexts = this.contexts.get(orgId) ?? new Map<string, CloudWatchContext>();
    const currentSources = new Set<string>();
    for (const source of sources) {
      currentSources.add(source.id);
      const context = this.watchContext(source, options);
      sourceContexts.set(source.id, context);
      this.watchCloudSource(orgId, hostId, source, sourceStops, options?.reconcile === true);
    }
    this.stopRemovedSources(orgId, currentSources, sourceStops, sourceContexts);
    this.storeOrgWatchers(orgId, sourceStops, sourceContexts);
  }

  private watchContext(
    source: CloudDriveSyncSource,
    options: CloudSyncWatchOptions | undefined,
  ): CloudWatchContext {
    const resolveCredential = options?.resolveCredential;
    const resolveAccessToken = options?.resolveAccessToken;
    return {
      source,
      ...(resolveCredential ? { resolveCredential: () => resolveCredential(source) } : {}),
      ...(resolveAccessToken ? { resolveAccessToken: () => resolveAccessToken(source) } : {}),
      ...(options?.onSync ? { onSync: options.onSync } : {}),
    };
  }

  private watchCloudSource(
    orgId: string,
    hostId: string,
    source: CloudDriveSyncSource,
    stops: Map<string, () => void>,
    reconcile: boolean,
  ): void {
    const alreadyWatching = stops.has(source.id);
    let mirrorRoot: string;
    try {
      mirrorRoot = this.sourceLocation.resolve({ orgId, sourceId: source.id, hostId }).absoluteRoot;
    } catch (err) {
      trace('cloud-sync-back', 'mirror root unresolved', {
        orgId,
        sourceId: source.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    if (!alreadyWatching) {
      stops.set(source.id, this.watchSourcePath(orgId, source.id, mirrorRoot));
    }
    if (!alreadyWatching || reconcile) {
      this.reconcileSource(orgId, source.id, mirrorRoot);
    }
  }

  private watchSourcePath(orgId: string, sourceId: string, mirrorRoot: string): () => void {
    return this.filesWatcher.watch(sourceId, mirrorRoot, (event) => {
      const path = event.dir ? `${event.dir}/${event.name}` : event.name;
      this.queue.enqueue({ orgId, sourceId, path, kind: event.kind });
    });
  }

  private reconcileSource(orgId: string, sourceId: string, mirrorRoot: string): void {
    for (const change of scanCloudMirrorChanges(mirrorRoot)) {
      this.queue.enqueue({ ...change, orgId, sourceId });
    }
  }

  private stopRemovedSources(
    orgId: string,
    currentSources: Set<string>,
    stops: Map<string, () => void>,
    contexts: Map<string, CloudWatchContext>,
  ): void {
    for (const [sourceId, stop] of stops) {
      if (!currentSources.has(sourceId)) {
        stop();
        stops.delete(sourceId);
        contexts.delete(sourceId);
        this.queue.clearSource(orgId, sourceId);
      }
    }
    for (const sourceId of contexts.keys()) {
      if (!currentSources.has(sourceId)) {
        this.queue.clearSource(orgId, sourceId);
        contexts.delete(sourceId);
      }
    }
  }

  private storeOrgWatchers(
    orgId: string,
    stops: Map<string, () => void>,
    contexts: Map<string, CloudWatchContext>,
  ): void {
    if (stops.size > 0) {
      this.stops.set(orgId, stops);
      this.contexts.set(orgId, contexts);
    } else {
      this.stops.delete(orgId);
      this.contexts.delete(orgId);
    }
  }

  stopOrg(orgId: string): void {
    for (const stop of this.stops.get(orgId)?.values() ?? []) {
      stop();
    }
    this.queue.clearOrg(orgId);
    this.stops.delete(orgId);
    this.contexts.delete(orgId);
  }

  onModuleDestroy(): void {
    for (const orgId of this.stops.keys()) {
      this.stopOrg(orgId);
    }
  }

  private accessTokenGetter(
    orgId: string,
    context: CloudWatchContext,
  ): (() => Promise<string>) | null {
    if (context.resolveCredential) {
      if (!context.leasedClient) {
        context.leasedClient = {};
      }
      return leasedTokenReader({
        secrets: this.secrets,
        orgId,
        source: context.source,
        clientCache: context.leasedClient,
      });
    }
    const resolveAccessToken = context.resolveAccessToken;
    return resolveAccessToken ? () => resolveAccessToken() : null;
  }

  private processQueuedChange(change: PendingCloudChange): Promise<void> {
    return this.syncPath(change.orgId, change.sourceId, change.path, change.kind);
  }

  private async syncPath(
    orgId: string,
    sourceId: string,
    path: string,
    kind: CloudChangeKind,
  ): Promise<void> {
    const hostId = this.machine.get().id;
    const context = this.contexts.get(orgId)?.get(sourceId);
    if (!context) {
      return;
    }
    const runId = crypto.randomUUID();
    const lease = this.writeLeases.acquire({
      orgId,
      sourceId,
      runId,
      nodeId: hostId,
      expiresAt: new Date(Date.now() + SYNC_LEASE_TTL_MS).toISOString(),
    });
    if (!lease.ok) {
      throw new Error('cloud source write lease is held');
    }
    const credentialKey = googleCredKey(context.source.distribution.integrationId);
    let temporaryCredential = false;
    let credentialLease: CloudSyncCredentialLease | undefined;
    try {
      if (context.resolveCredential) {
        credentialLease = await context.resolveCredential();
        await this.secrets.set(orgId, credentialKey, credentialLease.credential);
        temporaryCredential = true;
      }
      const getAccessToken = this.accessTokenGetter(orgId, context);
      if (!getAccessToken) {
        return;
      }
      const syncResult = await syncBackCloudPath({
        source: context.source,
        sourceLocation: this.sourceLocation,
        machine: this.machine,
        getAccessToken,
        orgId,
        path,
        kind,
      });
      if (!syncResult) {
        return;
      }
      const outcome = recordCloudSyncResult({
        materializations: this.materializations,
        materializationEvents: this.materializationEvents,
        orgId,
        sourceId,
        hostId,
        result: syncResult,
      });
      if (outcome) {
        context.onSync?.(outcome.frame, outcome.sourceChanged);
      }
    } catch (err) {
      const frame = recordCloudSyncFailure({
        materializations: this.materializations,
        materializationEvents: this.materializationEvents,
        orgId,
        sourceId,
        hostId,
      });
      if (frame) {
        context.onSync?.(frame, false);
      }
      throw err;
    } finally {
      if (temporaryCredential) {
        try {
          await this.secrets.delete(orgId, credentialKey);
        } catch (err) {
          trace('cloud-sync-back', 'temporary credential cleanup failed', {
            orgId,
            sourceId,
            error: String(err),
          });
        }
      }
      try {
        await credentialLease?.release();
      } catch (err) {
        trace('cloud-sync-back', 'central write lease release failed', {
          orgId,
          sourceId,
          error: String(err),
        });
      } finally {
        this.writeLeases.release(orgId, sourceId, runId);
      }
    }
  }
}
