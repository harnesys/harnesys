import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type {
  CloudRemoteBackendPort,
  CloudRemoteEntry,
} from '../../../../domain/source/cloud-remote-backend.port.ts';
import { supportsDocumentExport } from '../../../../domain/source/cloud-remote-backend.port.ts';

export interface MirrorMetaFile {
  remoteId: string;
  kind: 'file' | 'folder';
  remoteModifiedAt?: string;
  mimeType?: string;
  localHash?: string;
}

export interface SyncBackResult {
  status: 'uploaded' | 'keep-both' | 'revision-unknown' | 'folder-created' | 'deleted';
  localPath: string;
  remoteId?: string;
  conflictPath?: string;
  errorCode?: string;
}

const META_DIR = '.harnesys-mirror';

export function mirrorRoot(materializeRoot: string): string {
  return join(materializeRoot, 'mirror');
}

export function ensureMirrorRoot(materializeRoot: string): string {
  const root = mirrorRoot(materializeRoot);
  removeSymlink(root);
  mkdirSync(root, { recursive: true });
  const metadataRoot = join(root, META_DIR);
  removeSymlink(metadataRoot);
  mkdirSync(metadataRoot, { recursive: true });
  return root;
}

export function conflictLocalName(name: string, at = new Date()): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const dot = name.lastIndexOf('.');
  if (dot > 0 && dot < name.length - 1) {
    return `${name.slice(0, dot)} (conflict, ${stamp})${name.slice(dot)}`;
  }
  return `${name} (conflict, ${stamp})`;
}

function metaPath(mirror: string, relativePath: string): string {
  assertSafeCloudPath(relativePath);
  const safe = relativePath.split(/[/\\]/).filter(Boolean).join(sep);
  return join(mirror, META_DIR, `${safe}.json`);
}

export function readMirrorMeta(mirror: string, relativePath: string): MirrorMetaFile | null {
  try {
    const path = metaPath(mirror, relativePath);
    if (pathHasSymlink(mirror, join(META_DIR, `${relativePath}.json`))) {
      return null;
    }
    const raw = readFileSync(path, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      'remoteId' in parsed &&
      typeof (parsed as MirrorMetaFile).remoteId === 'string'
    ) {
      return parsed as MirrorMetaFile;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeMirrorMeta(mirror: string, relativePath: string, meta: MirrorMetaFile): void {
  const path = metaPath(mirror, relativePath);
  removeSymlinkComponents(mirror, join(META_DIR, `${relativePath}.json`));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(meta), { mode: 0o600 });
}

export function removeMirrorMeta(mirror: string, relativePath: string): void {
  const path = metaPath(mirror, relativePath);
  removeSymlinkComponents(mirror, join(META_DIR, `${relativePath}.json`));
  try {
    unlinkSync(path);
  } catch {
    return;
  }
  removeEmptyMetaParents(mirror, dirname(path));
}

function removeEmptyMetaParents(mirror: string, start: string): void {
  let parent = start;
  const metaRoot = join(mirror, META_DIR);
  while (parent !== metaRoot && parent.startsWith(`${metaRoot}${sep}`)) {
    try {
      rmSync(parent, { recursive: false });
    } catch {
      return;
    }
    parent = dirname(parent);
  }
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function hydratePath(input: {
  backend: CloudRemoteBackendPort;
  mirror: string;
  relativePath: string;
  remoteId: string;
  kind: 'file' | 'folder';
  exportMime?: string;
}): Promise<void> {
  const { backend, mirror, relativePath, remoteId, kind, exportMime } = input;
  assertSafeCloudPath(relativePath);
  removeSymlinkComponents(mirror, relativePath);
  const abs = join(mirror, relativePath);
  if (kind === 'folder') {
    mkdirSync(abs, { recursive: true });
    writeMirrorMeta(mirror, relativePath, { remoteId, kind: 'folder' });
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  const bytes =
    exportMime && supportsDocumentExport(backend)
      ? await backend.exportDocument?.(remoteId, exportMime)
      : await backend.download(remoteId);
  if (!bytes) {
    throw new Error('CLOUD_EXPORT_FAILED');
  }
  writeFileSync(abs, bytes);
  const remote = await backend.getMetadata(remoteId);
  writeMirrorMeta(mirror, relativePath, {
    remoteId,
    kind: 'file',
    remoteModifiedAt: remote.modifiedAt,
    mimeType: remote.mimeType,
    localHash: contentHash(bytes),
  });
}

export function assertSafeCloudPath(relativePath: string): void {
  const parts = relativePath.split(/[/\\]/);
  if (
    relativePath.startsWith('/') ||
    relativePath.includes('\\') ||
    relativePath.includes('\0') ||
    parts.some(
      (part) =>
        part === '' || part === '.' || part === '..' || part === META_DIR || part === '.git',
    )
  ) {
    throw new Error('CLOUD_PATH_UNSUPPORTED');
  }
}

export function assertSafeCloudName(name: string): void {
  if (
    name === '' ||
    name === '.' ||
    name === '..' ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name === META_DIR ||
    name === '.git'
  ) {
    throw new Error('CLOUD_PATH_UNSUPPORTED');
  }
}

function removeSymlinkComponents(mirror: string, relativePath: string): void {
  let current = mirror;
  for (const part of relativePath.split(/[/\\]/)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        unlinkSync(current);
        return;
      }
    } catch {
      return;
    }
  }
}

function removeSymlink(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      unlinkSync(path);
    }
  } catch {
    return;
  }
}

function pathHasSymlink(root: string, relativePath: string): boolean {
  let current = root;
  for (const part of relativePath.split(/[/\\]/).filter(Boolean)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

export function listRemoteAsTree(
  backend: CloudRemoteBackendPort,
  folderId: string,
): Promise<CloudRemoteEntry[]> {
  return backend.listChildren(folderId);
}

export function remoteParentIdForPath(
  mirror: string,
  relativePath: string,
  rootRemoteId: string,
): string {
  const parent = dirname(relativePath);
  if (parent === '.') {
    return rootRemoteId;
  }
  const meta = readMirrorMeta(mirror, parent);
  return meta?.kind === 'folder' && meta.remoteId ? meta.remoteId : rootRemoteId;
}
