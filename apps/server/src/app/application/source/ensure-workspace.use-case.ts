import { mkdirSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgWorkspacePathInvalidException } from '../../domain/org/org.error.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

const WORKSPACE_NAME = 'Workspace';

export interface EnsureWorkspaceOptions {
  localPath?: string;
}

@Injectable()
export class EnsureWorkspaceUseCase {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(orgId: string, opts?: EnsureWorkspaceOptions): void {
    const existing = this.sources.findManagedWorkspace(orgId);
    if (existing) {
      this.healReadyProjection(orgId, existing.id);
      return;
    }
    const localPath = this.resolveWorkspacePath(orgId, opts?.localPath);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const hostId = this.machineConfig.get().id;
    this.sources.insert({
      id,
      orgId,
      name: WORKSPACE_NAME,
      distribution: { kind: 'host-bound', hostId },
      uiVisibility: 'org',
      managed: true,
      createdAt: now,
      updatedAt: now,
    });
    this.materializations.upsert({
      orgId,
      sourceId: id,
      hostId,
      origin: 'managed',
      localPath,
      state: 'ready',
      revision: 1,
      updatedAt: now,
    });
    this.materializations.upsertProjection({
      orgId,
      sourceId: id,
      hostId,
      state: 'ready',
      revision: 1,
      lastConfirmedAt: now,
      lastErrorCode: null,
      lastConflictPaths: [],
      refreshRequired: false,
    });
  }

  private resolveWorkspacePath(orgId: string, localPath?: string): string {
    try {
      if (localPath === undefined) {
        return this.layout.ensureOrgWorkspace(orgId);
      }
      const trimmed = localPath.trim();
      if (!isAbsolute(trimmed)) {
        throw new OrgWorkspacePathInvalidException(trimmed);
      }
      mkdirSync(trimmed, { recursive: true });
      return trimmed;
    } catch (error) {
      if (error instanceof OrgWorkspacePathInvalidException) {
        throw error;
      }
      const cause = error instanceof Error ? error.message : String(error);
      throw new SourcePathInvalidException(
        `failed to prepare workspace path${localPath ? ` ${localPath.trim()}` : ''}: ${cause}`,
      );
    }
  }

  private healReadyProjection(orgId: string, sourceId: string): void {
    const hostId = this.machineConfig.get().id;
    const local = this.materializations.find(orgId, sourceId, hostId);
    if (local?.state !== 'ready') {
      return;
    }
    const projection = this.materializations.findProjection(orgId, sourceId, hostId);
    if (projection?.state === 'ready') {
      return;
    }
    this.materializations.upsertProjection({
      orgId,
      sourceId,
      hostId,
      state: 'ready',
      revision: Math.max(local.revision, projection?.revision ?? 0),
      lastConfirmedAt: local.updatedAt,
      lastErrorCode: null,
      lastConflictPaths: local.lastConflictPaths,
      refreshRequired: local.refreshRequired,
    });
  }
}
