import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MaterializationState } from '@harnesys/contracts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type {
  CloudRemoteBackendPort,
  CloudRemoteEntry,
} from '../../domain/source/cloud-remote-backend.port.ts';
import type { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import type { MirrorMetaFile } from '../../infra/source/drivers/cloud/cloud-mirror-engine.ts';
import {
  assertSafeCloudName,
  conflictLocalName,
  contentHash,
  ensureMirrorRoot,
  hydratePath,
  readMirrorMeta,
} from '../../infra/source/drivers/cloud/cloud-mirror-engine.ts';
import { pruneRemovedRemoteEntries } from '../../infra/source/drivers/cloud/cloud-mirror-reconcile.ts';
import {
  GOOGLE_APPS_EXPORTS,
  GoogleDriveBackend,
} from '../../infra/source/drivers/cloud/google-drive.backend.ts';

export interface MaterializeCloudSourceInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  remoteFolderId: string;
  getAccessToken: () => Promise<string>;
  layout: HostFsLayoutPort;
  materializations: SourceMaterializationPort;
  force?: boolean;
  createBackend?: (getToken: () => Promise<string>) => CloudRemoteBackendPort;
}

export interface MaterializeCloudSourceResult {
  state: MaterializationState;
  revision: number;
  errorCode?: string;
  skippedGoogleApps: number;
  localPath: string | null;
}

export async function materializeCloudSourceOnHost(
  input: MaterializeCloudSourceInput,
): Promise<MaterializeCloudSourceResult> {
  const existing = input.materializations.find(input.orgId, input.sourceId, input.hostId);
  if (existing?.state === 'ready' && !existing.refreshRequired && !input.force) {
    return {
      state: 'ready',
      revision: existing.revision,
      skippedGoogleApps: 0,
      localPath: existing.localPath,
    };
  }
  const nextRevision = (existing?.revision ?? 0) + 1;
  const now = new Date().toISOString();
  input.materializations.upsert({
    orgId: input.orgId,
    sourceId: input.sourceId,
    hostId: input.hostId,
    origin: 'managed',
    localPath: existing?.localPath ?? null,
    state: 'materializing',
    revision: nextRevision,
    updatedAt: now,
    lastError: null,
    lastConflictPaths: existing?.lastConflictPaths ?? [],
    refreshRequired: false,
  });
  try {
    const materializeRoot = input.layout.ensureOrgSourceDir(input.orgId, input.sourceId);
    const mirror = ensureMirrorRoot(materializeRoot);
    const createBackend = input.createBackend ?? ((getToken) => new GoogleDriveBackend(getToken));
    const drive = createBackend(input.getAccessToken);
    const remotePaths = new Set<string>();
    const skippedGoogleApps = await hydrateCloudChildren(
      drive,
      mirror,
      input.remoteFolderId,
      '',
      remotePaths,
    );
    pruneRemovedRemoteEntries(mirror, remotePaths);
    const readyRevision = nextRevision + 1;
    const readyAt = new Date().toISOString();
    input.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: mirror,
      state: 'ready',
      revision: readyRevision,
      updatedAt: readyAt,
      lastError: null,
      lastConflictPaths: existing?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    return {
      state: 'ready',
      revision: readyRevision,
      skippedGoogleApps,
      localPath: mirror,
    };
  } catch (err) {
    const failedRevision = nextRevision + 1;
    const errorCode = classifyCloudError(err);
    input.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: existing?.localPath ?? null,
      state: 'failed',
      revision: failedRevision,
      updatedAt: new Date().toISOString(),
      lastError: errorCode,
      lastConflictPaths: existing?.lastConflictPaths ?? [],
      refreshRequired: false,
    });
    return {
      state: 'failed',
      revision: failedRevision,
      errorCode,
      skippedGoogleApps: 0,
      localPath: existing?.localPath ?? null,
    };
  }
}

export function classifyCloudError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('invalid_grant') || raw.includes('Missing Google credentials')) {
    return 'CLOUD_CREDENTIALS_INVALID';
  }
  if (raw.includes('SERVICE_DISABLED') || raw.includes('accessNotConfigured')) {
    return 'CLOUD_API_DISABLED';
  }
  if (raw.includes('quota') || raw.includes('rateLimitExceeded')) {
    return 'CLOUD_QUOTA_EXCEEDED';
  }
  return raw.slice(0, 200) || 'materialize_failed';
}

async function hydrateCloudChildren(
  drive: CloudRemoteBackendPort,
  mirror: string,
  parentRemoteId: string,
  relativeDir: string,
  remotePaths: Set<string>,
): Promise<number> {
  const children = await drive.listChildren(parentRemoteId);
  let skippedGoogleApps = 0;
  for (const entry of children) {
    const skippedInEntry = await hydrateCloudEntry(drive, mirror, relativeDir, entry, remotePaths);
    skippedGoogleApps += skippedInEntry;
  }
  return skippedGoogleApps;
}

async function hydrateCloudEntry(
  drive: CloudRemoteBackendPort,
  mirror: string,
  relativeDir: string,
  entry: CloudRemoteEntry,
  remotePaths: Set<string>,
): Promise<number> {
  const exportTarget = entry.mimeType ? GOOGLE_APPS_EXPORTS[entry.mimeType] : undefined;
  if (entry.mimeType?.startsWith('application/vnd.google-apps.') && !exportTarget) {
    return 1;
  }
  const mirrorName = exportTarget ? `${entry.name}.${exportTarget.extension}` : entry.name;
  assertSafeCloudName(entry.name);
  assertSafeCloudName(mirrorName);
  const relativePath = relativeDir ? `${relativeDir}/${mirrorName}` : mirrorName;
  remotePaths.add(relativePath);
  if (entry.kind === 'folder') {
    await hydratePath({
      backend: drive,
      mirror,
      relativePath,
      remoteId: entry.id,
      kind: entry.kind,
    });
    return hydrateCloudChildren(drive, mirror, entry.id, relativePath, remotePaths);
  }
  if (isUnchangedMirrorEntry(mirror, relativePath, entry)) {
    return 0;
  }
  const fileMeta = readMirrorMeta(mirror, relativePath);
  if (
    fileMeta?.remoteId === entry.id &&
    fileMeta.remoteModifiedAt === entry.modifiedAt &&
    !existsSync(join(mirror, relativePath))
  ) {
    return 0;
  }
  preserveDirtyLocalFile(mirror, relativePath);
  await hydratePath({
    backend: drive,
    mirror,
    relativePath,
    remoteId: entry.id,
    kind: entry.kind,
    ...(exportTarget?.exportMime ? { exportMime: exportTarget.exportMime } : {}),
  });
  return 0;
}

function isUnchangedMirrorEntry(
  mirror: string,
  relativePath: string,
  entry: CloudRemoteEntry,
): boolean {
  const existingMeta = readMirrorMeta(mirror, relativePath);
  const abs = join(mirror, relativePath);
  const localHash = existsSync(abs) ? contentHash(new Uint8Array(readFileSync(abs))) : null;
  return (
    existingMeta?.remoteId === entry.id &&
    existingMeta.kind === entry.kind &&
    entry.kind === 'file' &&
    Boolean(existingMeta.remoteModifiedAt) &&
    Boolean(entry.modifiedAt) &&
    existingMeta.remoteModifiedAt === entry.modifiedAt &&
    existingMeta.localHash === localHash
  );
}

function preserveDirtyLocalFile(mirror: string, relativePath: string): void {
  const meta = readMirrorMeta(mirror, relativePath);
  const abs = join(mirror, relativePath);
  if (meta?.kind !== 'file' || !existsSync(abs)) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(abs));
  if (meta.localHash && contentHash(bytes) === meta.localHash) {
    return;
  }
  const parent = dirname(relativePath);
  const conflictName = conflictLocalName(relativePath.split(/[/\\]/).pop() ?? relativePath);
  const conflictPath = parent === '.' ? conflictName : `${parent}/${conflictName}`;
  const conflictAbs = join(mirror, conflictPath);
  mkdirSync(dirname(conflictAbs), { recursive: true });
  writeFileSync(conflictAbs, bytes);
  const conflictMeta: MirrorMetaFile = {
    remoteId: '',
    kind: 'file',
    mimeType: meta.mimeType,
  };
  const metaPath = join(mirror, '.harnesys-mirror', `${conflictPath}.json`);
  mkdirSync(dirname(metaPath), { recursive: true });
  writeFileSync(metaPath, JSON.stringify(conflictMeta), { mode: 0o600 });
}
