import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentHash, readMirrorMeta } from './cloud-mirror-engine.ts';
import type { CloudChangeKind } from './cloud-sync-back.ts';

interface LocalEntry {
  kind: 'file' | 'folder' | 'unsupported';
  localHash?: string;
}

export interface CloudLocalChange {
  path: string;
  kind: CloudChangeKind;
}

export function scanCloudMirrorChanges(mirror: string): CloudLocalChange[] {
  if (isSymbolicLink(mirror)) {
    return [];
  }
  const entries = walkLocal(mirror);
  const changes = [
    ...collectLocalChanges(mirror, entries),
    ...collectDeletedMetadata(mirror, entries),
  ];
  return changes.sort(compareCloudChanges);
}

function walkLocal(root: string): Map<string, LocalEntry> {
  const out = new Map<string, LocalEntry>();
  const pending = [''];
  while (pending.length > 0) {
    const relativeDir = pending.pop() ?? '';
    collectLocalDirectory(root, relativeDir, out, pending);
  }
  return out;
}

function collectLocalDirectory(
  root: string,
  relativeDir: string,
  out: Map<string, LocalEntry>,
  pending: string[],
): void {
  const absDir = relativeDir ? join(root, relativeDir) : root;
  for (const name of readNames(absDir)) {
    if (!isInternalName(name)) {
      addLocalEntry(root, relativeDir, name, out, pending);
    }
  }
}

function addLocalEntry(
  root: string,
  relativeDir: string,
  name: string,
  out: Map<string, LocalEntry>,
  pending: string[],
): void {
  const path = relativeDir ? `${relativeDir}/${name}` : name;
  const entry = readLocalEntry(join(root, path));
  if (!entry) {
    return;
  }
  out.set(path, entry);
  if (entry.kind === 'folder') {
    pending.push(path);
  }
}

function listMirrorMetadataPaths(mirror: string): string[] {
  const metaRoot = join(mirror, '.harnesys-mirror');
  const paths: string[] = [];
  const pending = [''];
  while (pending.length > 0) {
    const relativeDir = pending.pop() ?? '';
    const absDir = relativeDir ? join(metaRoot, relativeDir) : metaRoot;
    for (const name of readNames(absDir)) {
      const path = relativeDir ? `${relativeDir}/${name}` : name;
      const absPath = join(metaRoot, path);
      if (isDirectory(absPath)) {
        pending.push(path);
      } else if (name.endsWith('.json')) {
        paths.push(path.slice(0, -'.json'.length));
      }
    }
  }
  return paths;
}

function collectLocalChanges(mirror: string, entries: Map<string, LocalEntry>): CloudLocalChange[] {
  const changes: CloudLocalChange[] = [];
  for (const [path, entry] of entries) {
    const change = localEntryChange(mirror, path, entry);
    if (change) {
      changes.push(change);
    }
  }
  return changes;
}

function localEntryChange(
  mirror: string,
  path: string,
  entry: LocalEntry,
): CloudLocalChange | null {
  const meta = readMirrorMeta(mirror, path);
  if (entry.kind === 'unsupported') {
    return null;
  }
  if (entry.kind === 'folder') {
    return meta?.kind === 'folder' && meta.remoteId ? null : { path, kind: 'create' };
  }
  if (
    meta?.kind === 'file' &&
    meta.remoteId &&
    meta.localHash !== undefined &&
    meta.localHash === entry.localHash
  ) {
    return null;
  }
  return { path, kind: meta?.remoteId ? 'change' : 'create' };
}

function collectDeletedMetadata(
  mirror: string,
  entries: Map<string, LocalEntry>,
): CloudLocalChange[] {
  return listMirrorMetadataPaths(mirror).flatMap((path) => {
    const meta = readMirrorMeta(mirror, path);
    return meta?.remoteId && !entries.has(path) ? [{ path, kind: 'delete' as const }] : [];
  });
}

function readLocalEntry(absPath: string): LocalEntry | null {
  try {
    if (lstatSync(absPath).isSymbolicLink()) {
      return { kind: 'unsupported' };
    }
  } catch {
    return null;
  }
  if (isDirectory(absPath)) {
    return { kind: 'folder' };
  }
  if (!isFile(absPath)) {
    return null;
  }
  try {
    const bytes = new Uint8Array(readFileSync(absPath));
    return { kind: 'file', localHash: contentHash(bytes) };
  } catch {
    return { kind: 'file' };
  }
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

function isSymbolicLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return true;
  }
}

function isInternalName(name: string): boolean {
  return name === '.harnesys-mirror' || name === '.git';
}

function compareCloudChanges(left: CloudLocalChange, right: CloudLocalChange): number {
  if (left.kind === 'delete' && right.kind !== 'delete') {
    return 1;
  }
  if (left.kind !== 'delete' && right.kind === 'delete') {
    return -1;
  }
  const depth = left.path.split('/').length - right.path.split('/').length;
  return left.kind === 'delete' ? -depth : depth;
}
