import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type {
  CloudRemoteBackendPort,
  CloudRemoteEntry,
} from '../../../../domain/source/cloud-remote-backend.port.ts';
import {
  conflictLocalName,
  contentHash,
  type MirrorMetaFile,
  readMirrorMeta,
  remoteParentIdForPath,
  removeMirrorMeta,
  type SyncBackResult,
  writeMirrorMeta,
} from './cloud-mirror-engine.ts';

export interface SyncBackFileInput {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
  parentRemoteId: string;
  localBytes: Uint8Array;
}

export interface SyncBackFolderInput {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
  rootRemoteId: string;
}

export interface SyncDeletePathInput {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
}

interface TrackedFileInput extends SyncBackFileInput {
  baseName: string;
  resolvedParentId: string;
  meta: MirrorMetaFile;
}

interface UploadLocalFileInput {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
  name: string;
  parentId: string;
  bytes: Uint8Array;
  mimeType?: string;
}

interface UpdateRemoteFileInput {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
  name: string;
  parentId: string;
  bytes: Uint8Array;
  meta: MirrorMetaFile;
}

interface PreserveBothVersionsInput extends TrackedFileInput {
  remote: CloudRemoteEntry;
}

export async function syncBackFile(input: SyncBackFileInput): Promise<SyncBackResult> {
  const meta = readMirrorMeta(input.mirror, input.relativePath);
  const baseName = input.relativePath.split(/[/\\]/).pop() || input.relativePath;
  const resolvedParentId = remoteParentIdForPath(
    input.mirror,
    input.relativePath,
    input.parentRemoteId,
  );
  if (meta?.kind === 'file' && meta.remoteId) {
    return syncTrackedFile({ ...input, baseName, resolvedParentId, meta });
  }
  return uploadLocalFile({
    backend: input.backend,
    mirror: input.mirror,
    relativePath: input.relativePath,
    name: baseName,
    parentId: resolvedParentId,
    bytes: input.localBytes,
    mimeType: meta?.mimeType,
  });
}

async function syncTrackedFile(input: TrackedFileInput): Promise<SyncBackResult> {
  const remote = await getRemoteFileOrNull(input.backend, input.meta.remoteId);
  if (!remote) {
    return uploadLocalFile({
      backend: input.backend,
      mirror: input.mirror,
      relativePath: input.relativePath,
      name: input.baseName,
      parentId: input.resolvedParentId,
      bytes: input.localBytes,
      mimeType: input.meta.mimeType,
    });
  }
  if (!input.meta.remoteModifiedAt || !remote.modifiedAt) {
    writeFileSync(join(input.mirror, input.relativePath), input.localBytes);
    return {
      status: 'revision-unknown',
      localPath: input.relativePath,
      remoteId: input.meta.remoteId,
      errorCode: 'CLOUD_REVISION_UNKNOWN',
    };
  }
  if (remote.modifiedAt !== input.meta.remoteModifiedAt) {
    return preserveBothVersions({ ...input, remote });
  }
  return updateRemoteFile({
    backend: input.backend,
    mirror: input.mirror,
    relativePath: input.relativePath,
    name: input.baseName,
    parentId: input.resolvedParentId,
    bytes: input.localBytes,
    meta: input.meta,
  });
}

async function getRemoteFileOrNull(
  backend: CloudRemoteBackendPort,
  remoteId: string,
): Promise<CloudRemoteEntry | null> {
  try {
    return await backend.getMetadata(remoteId);
  } catch (err) {
    if (isRemoteNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

async function uploadLocalFile(input: UploadLocalFileInput): Promise<SyncBackResult> {
  const abs = join(input.mirror, input.relativePath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, input.bytes);
  const uploaded = await input.backend.upload({
    parentId: input.parentId,
    name: input.name,
    content: input.bytes,
    mimeType: input.mimeType,
  });
  writeMirrorMeta(input.mirror, input.relativePath, {
    remoteId: uploaded.id,
    kind: 'file',
    remoteModifiedAt: uploaded.modifiedAt,
    mimeType: input.mimeType,
    localHash: contentHash(input.bytes),
  });
  return { status: 'uploaded', localPath: input.relativePath, remoteId: uploaded.id };
}

async function updateRemoteFile(input: UpdateRemoteFileInput): Promise<SyncBackResult> {
  writeFileSync(join(input.mirror, input.relativePath), input.bytes);
  const uploaded = await input.backend.upload({
    parentId: input.parentId,
    name: input.name,
    content: input.bytes,
    mimeType: input.meta.mimeType,
    fileId: input.meta.remoteId,
  });
  writeMirrorMeta(input.mirror, input.relativePath, {
    ...input.meta,
    remoteId: uploaded.id,
    remoteModifiedAt: uploaded.modifiedAt,
    localHash: contentHash(input.bytes),
  });
  return { status: 'uploaded', localPath: input.relativePath, remoteId: uploaded.id };
}

async function preserveBothVersions(input: PreserveBothVersionsInput): Promise<SyncBackResult> {
  const conflictName = conflictLocalName(input.baseName);
  const parentRel = dirname(input.relativePath);
  const conflictRel =
    parentRel === '.' ? conflictName : join(parentRel, conflictName).split(sep).join('/');
  const remoteBytes = await input.backend.download(input.meta.remoteId);
  const uploaded = await input.backend.upload({
    parentId: input.resolvedParentId,
    name: conflictName,
    content: input.localBytes,
    mimeType: input.meta.mimeType,
  });
  writeFileSync(join(input.mirror, conflictRel), input.localBytes);
  writeMirrorMeta(input.mirror, conflictRel, {
    remoteId: uploaded.id,
    kind: 'file',
    remoteModifiedAt: uploaded.modifiedAt,
    mimeType: input.meta.mimeType,
    localHash: contentHash(input.localBytes),
  });
  writeFileSync(join(input.mirror, input.relativePath), remoteBytes);
  writeMirrorMeta(input.mirror, input.relativePath, {
    ...input.meta,
    remoteModifiedAt: input.remote.modifiedAt,
    mimeType: input.remote.mimeType ?? input.meta.mimeType,
    localHash: contentHash(remoteBytes),
  });
  return {
    status: 'keep-both',
    localPath: input.relativePath,
    conflictPath: conflictRel,
    remoteId: uploaded.id,
  };
}

export async function syncBackFolder(input: SyncBackFolderInput): Promise<SyncBackResult> {
  const existing = readMirrorMeta(input.mirror, input.relativePath);
  if (existing?.kind === 'folder' && existing.remoteId) {
    return { status: 'folder-created', localPath: input.relativePath, remoteId: existing.remoteId };
  }
  const parentId = remoteParentIdForPath(input.mirror, input.relativePath, input.rootRemoteId);
  const name = input.relativePath.split(/[/\\]/).pop() || input.relativePath;
  const folder = await input.backend.createFolder({ parentId, name });
  writeMirrorMeta(input.mirror, input.relativePath, { remoteId: folder.id, kind: 'folder' });
  return { status: 'folder-created', localPath: input.relativePath, remoteId: folder.id };
}

export async function syncDeletePath(input: SyncDeletePathInput): Promise<SyncBackResult> {
  const meta = readMirrorMeta(input.mirror, input.relativePath);
  if (meta?.remoteId) {
    const conflict = await deleteConflict(input.backend, input.relativePath, meta);
    if (conflict) {
      return conflict;
    }
    await input.backend.delete(meta.remoteId);
  }
  removeMirrorMeta(input.mirror, input.relativePath);
  return { status: 'deleted', localPath: input.relativePath, remoteId: meta?.remoteId };
}

async function deleteConflict(
  backend: CloudRemoteBackendPort,
  relativePath: string,
  meta: MirrorMetaFile,
): Promise<SyncBackResult | null> {
  if (meta.kind === 'folder') {
    const children = await backend.listChildren(meta.remoteId);
    return children.length > 0
      ? {
          status: 'revision-unknown',
          localPath: relativePath,
          remoteId: meta.remoteId,
          errorCode: 'CLOUD_FOLDER_NOT_EMPTY',
        }
      : null;
  }
  return checkRemoteFileRevision(backend, relativePath, meta);
}

async function checkRemoteFileRevision(
  backend: CloudRemoteBackendPort,
  relativePath: string,
  meta: MirrorMetaFile,
): Promise<SyncBackResult | null> {
  if (!meta.remoteModifiedAt) {
    return null;
  }
  try {
    const remote = await backend.getMetadata(meta.remoteId);
    return remote.modifiedAt === meta.remoteModifiedAt
      ? null
      : {
          status: 'revision-unknown',
          localPath: relativePath,
          remoteId: meta.remoteId,
          errorCode: 'CLOUD_REVISION_CHANGED',
        };
  } catch (err) {
    if (isRemoteNotFoundError(err)) {
      return null;
    }
    throw err;
  }
}

function isRemoteNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('404') || message.includes('notFound');
}
