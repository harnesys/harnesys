import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MachineConfigPort } from '../../../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../../../domain/source/source-registry.port.ts';
import { trace } from '../../../../libs/trace.ts';
import {
  assertSafeCloudPath,
  contentHash,
  readMirrorMeta,
  type SyncBackResult,
} from './cloud-mirror-engine.ts';
import { scanCloudMirrorChanges } from './cloud-mirror-scan.ts';
import { syncBackFile, syncBackFolder, syncDeletePath } from './cloud-mirror-sync.ts';
import { GoogleDriveBackend } from './google-drive.backend.ts';

export interface CloudDriveSyncSource {
  id: string;
  distribution: {
    kind: 'cloud-drive';
    remoteFolderId: string;
    integrationId: string;
  };
}

export interface CloudSyncPathInput {
  orgId: string;
  source: CloudDriveSyncSource;
  sourceLocation: SourceLocationPort;
  machine: MachineConfigPort;
  getAccessToken: () => Promise<string>;
  path: string;
  kind: CloudChangeKind;
}

export interface CloudSyncLocalDependencies {
  sources: SourceRegistryPort;
  sourceLocation: SourceLocationPort;
  machine: MachineConfigPort;
  getAccessToken: () => Promise<string>;
}

export type CloudChangeKind = 'create' | 'change' | 'delete';

export interface CloudSyncStateFrame {
  sourceId: string;
  hostId: string;
  revision: number;
  state: 'ready' | 'failed';
  lastErrorCode?: string;
  lastConflictPaths?: string[];
  refreshRequired?: boolean;
}

export async function syncBackCloudFile(
  deps: CloudSyncLocalDependencies,
  orgId: string,
  sourceId: string,
  path: string,
): Promise<SyncBackResult | null> {
  assertSafeCloudPath(path);
  const source = deps.sources.findById(orgId, sourceId);
  if (source?.distribution.kind !== 'cloud-drive') {
    return null;
  }
  const hostId = deps.machine.get().id;
  let mirrorRoot: string;
  try {
    mirrorRoot = deps.sourceLocation.resolve({ orgId, sourceId, hostId }).absoluteRoot;
  } catch (err) {
    trace('cloud-sync-back', 'mirror root unresolved', {
      orgId,
      sourceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  const abs = join(mirrorRoot, path);
  if (pathHasSymlink(mirrorRoot, path) || !existsSync(abs) || !lstatSync(abs).isFile()) {
    return null;
  }
  const bytes = new Uint8Array(readFileSync(abs));
  const meta = readMirrorMeta(mirrorRoot, path);
  if (isExportedGoogleDoc(meta)) {
    return null;
  }
  if (meta?.remoteId && meta.localHash === contentHash(bytes)) {
    return null;
  }
  const drive = new GoogleDriveBackend(deps.getAccessToken);
  return syncBackFile({
    backend: drive,
    mirror: mirrorRoot,
    relativePath: path,
    parentRemoteId: source.distribution.remoteFolderId,
    localBytes: bytes,
  });
}

export async function syncBackCloudPath(deps: CloudSyncPathInput): Promise<SyncBackResult | null> {
  const { orgId, source, path } = deps;
  assertSafeCloudPath(path);
  const hostId = deps.machine.get().id;
  const mirrorRoot = deps.sourceLocation.resolve({
    orgId,
    sourceId: source.id,
    hostId,
  }).absoluteRoot;
  const abs = join(mirrorRoot, path);
  if (pathHasSymlink(mirrorRoot, path)) {
    return null;
  }
  const meta = readMirrorMeta(mirrorRoot, path);
  if (isExportedGoogleDoc(meta) && deps.kind !== 'delete') {
    return null;
  }
  const kind = effectiveChangeKind(deps.kind, abs);
  if (isUnchangedCloudPath(kind, abs, meta)) {
    return null;
  }
  const drive = new GoogleDriveBackend(deps.getAccessToken);
  if (kind === 'delete') {
    return syncDeletePath({ backend: drive, mirror: mirrorRoot, relativePath: path });
  }
  if (lstatSync(abs).isDirectory()) {
    return syncBackFolder({
      backend: drive,
      mirror: mirrorRoot,
      relativePath: path,
      rootRemoteId: source.distribution.remoteFolderId,
    });
  }
  const bytes = new Uint8Array(readFileSync(abs));
  return syncBackFile({
    backend: drive,
    mirror: mirrorRoot,
    relativePath: path,
    parentRemoteId: source.distribution.remoteFolderId,
    localBytes: bytes,
  });
}

function isExportedGoogleDoc(meta: ReturnType<typeof readMirrorMeta>): boolean {
  return Boolean(meta?.mimeType?.startsWith('application/vnd.google-apps.'));
}

function effectiveChangeKind(kind: CloudChangeKind, absPath: string): CloudChangeKind {
  if (kind !== 'delete' || !existsSync(absPath)) {
    return kind;
  }
  return lstatSync(absPath).isDirectory() ? 'create' : 'change';
}

function isUnchangedCloudPath(
  kind: CloudChangeKind,
  absPath: string,
  meta: ReturnType<typeof readMirrorMeta>,
): boolean {
  if (kind === 'delete') {
    return !meta;
  }
  if (!existsSync(absPath)) {
    return true;
  }
  if (lstatSync(absPath).isDirectory()) {
    return meta?.kind === 'folder' && Boolean(meta.remoteId);
  }
  if (meta?.kind !== 'file' || !meta.remoteId || !meta.localHash) {
    return false;
  }
  return contentHash(new Uint8Array(readFileSync(absPath))) === meta.localHash;
}

function pathHasSymlink(root: string, relativePath: string): boolean {
  try {
    if (lstatSync(root).isSymbolicLink()) {
      return true;
    }
  } catch {
    return true;
  }
  let current = root;
  for (const part of relativePath.split(/[/\\]/).filter(Boolean)) {
    current = join(current, part);
    if (!existsSync(current)) {
      return false;
    }
    if (lstatSync(current).isSymbolicLink()) {
      return true;
    }
  }
  return false;
}

export interface CloudSyncFlushInput {
  orgId: string;
  source: CloudDriveSyncSource;
  sourceLocation: SourceLocationPort;
  machine: MachineConfigPort;
  getAccessToken: () => Promise<string>;
}

export async function flushCloudMirror(input: CloudSyncFlushInput): Promise<SyncBackResult[]> {
  let mirrorRoot: string;
  try {
    mirrorRoot = input.sourceLocation.resolve({
      orgId: input.orgId,
      sourceId: input.source.id,
      hostId: input.machine.get().id,
    }).absoluteRoot;
  } catch {
    return [];
  }
  const changes = scanCloudMirrorChanges(mirrorRoot);
  const results: SyncBackResult[] = [];
  for (const change of changes) {
    try {
      const result = await syncBackCloudPath({
        orgId: input.orgId,
        source: input.source,
        sourceLocation: input.sourceLocation,
        machine: input.machine,
        getAccessToken: input.getAccessToken,
        path: change.path,
        kind: change.kind,
      });
      if (result) {
        results.push(result);
      }
    } catch {}
  }
  return results;
}
