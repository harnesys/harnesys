import { existsSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Injectable, Logger } from '@harnesys/brix';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { WorkspaceContainerPort } from '../../domain/process-runtime/workspace-container.port.ts';
import { CloudSyncBackWatchPort } from '../../domain/source/cloud-sync-back-watch.port.ts';
import {
  ManagedSourceDetachForbiddenException,
  SourceNotFoundException,
} from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';

export interface DetachSourceInput {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class DetachSourceUseCase {
  private readonly log: Logger;

  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly knowledge: KnowledgeStorePort,
    private readonly containers: WorkspaceContainerPort,
    private readonly cloudSyncBackWatcher: CloudSyncBackWatchPort,
    logger: Logger,
  ) {
    this.log = logger.child('detach-source');
  }

  execute(input: DetachSourceInput): void {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (row.managed) {
      throw new ManagedSourceDetachForbiddenException(input.sourceId);
    }
    const hostId = this.machineConfig.get().id;
    const materialization = this.materializations.find(input.orgId, input.sourceId, hostId);
    if (
      materialization?.origin === 'managed' &&
      (hasGitVcs(row) || row.distribution.kind === 'cloud-drive')
    ) {
      this.removeManagedRoot(input.orgId, input.sourceId, materialization.localPath);
      this.releaseContainer(input.orgId, input.sourceId, hostId);
    }
    this.knowledge.deleteForSource(input.orgId, input.sourceId);
    this.materializations.removeForSource(input.orgId, input.sourceId);
    this.sources.remove(input.orgId, input.sourceId);
    this.cloudSyncBackWatcher.syncOrg(input.orgId);
  }

  private releaseContainer(orgId: string, sourceId: string, hostId: string): void {
    void this.containers.release(orgId, `source:${sourceId}@${hostId}`).catch((err: unknown) => {
      this.log.warn(
        { orgId, sourceId, hostId, err: err instanceof Error ? err.message : String(err) },
        'workspace container release failed',
      );
    });
  }

  private removeManagedRoot(orgId: string, sourceId: string, localPath: string | null): void {
    const expected = resolve(this.layout.orgSourceDir(orgId, sourceId));
    const candidate = localPath ? resolve(localPath) : expected;
    const dataRoot = resolve(this.layout.orgDataDir(orgId)) + sep;
    let managedRoot: string | null = null;
    if (candidate === expected || candidate.startsWith(expected + sep)) {
      managedRoot = expected;
    } else if (candidate.startsWith(dataRoot)) {
      managedRoot = candidate;
    }
    if (!managedRoot) {
      return;
    }
    if (existsSync(managedRoot)) {
      rmSync(managedRoot, { recursive: true, force: true });
    }
  }
}
