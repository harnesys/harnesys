import { lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  contentHash,
  readMirrorMeta,
  removeMirrorMeta,
  writeMirrorMeta,
} from './cloud-mirror-engine.ts';

export function pruneRemovedRemoteEntries(mirror: string, remotePaths: Set<string>): void {
  const paths = listLocalPaths(mirror).sort(
    (left, right) => right.split('/').length - left.split('/').length,
  );
  for (const relativePath of paths) {
    if (!remotePaths.has(relativePath)) {
      pruneRemovedEntry(mirror, relativePath);
    }
  }
}

function pruneRemovedEntry(mirror: string, relativePath: string): void {
  const abs = join(mirror, relativePath);
  const meta = readMirrorMeta(mirror, relativePath);
  if (!meta?.remoteId) {
    return;
  }
  if (isFile(abs)) {
    pruneRemovedFile(mirror, relativePath, abs, meta);
    return;
  }
  if (!isDirectory(abs)) {
    return;
  }
  if (directoryHasEntries(abs)) {
    writeMirrorMeta(mirror, relativePath, { kind: 'folder', remoteId: '' });
    return;
  }
  rmSync(abs, { recursive: true, force: true });
  removeMirrorMeta(mirror, relativePath);
}

function pruneRemovedFile(
  mirror: string,
  relativePath: string,
  abs: string,
  meta: NonNullable<ReturnType<typeof readMirrorMeta>>,
): void {
  const bytes = new Uint8Array(readFileSync(abs));
  if (!meta.localHash || contentHash(bytes) !== meta.localHash) {
    writeMirrorMeta(mirror, relativePath, {
      kind: 'file',
      remoteId: '',
      mimeType: meta.mimeType,
    });
    return;
  }
  rmSync(abs, { force: true });
  removeMirrorMeta(mirror, relativePath);
}

function listLocalPaths(mirror: string): string[] {
  const paths: string[] = [];
  const pending = [''];
  while (pending.length > 0) {
    const relativeDir = pending.pop() ?? '';
    const absDir = relativeDir ? join(mirror, relativeDir) : mirror;
    for (const name of readNames(absDir)) {
      if (isMirrorInternalName(name)) {
        continue;
      }
      const path = relativeDir ? `${relativeDir}/${name}` : name;
      const abs = join(mirror, path);
      paths.push(path);
      if (isDirectory(abs)) {
        pending.push(path);
      }
    }
  }
  return paths;
}

function readNames(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function directoryHasEntries(path: string): boolean {
  return readNames(path).length > 0;
}

function isMirrorInternalName(name: string): boolean {
  return name === '.harnesys-mirror' || name === '.git';
}
