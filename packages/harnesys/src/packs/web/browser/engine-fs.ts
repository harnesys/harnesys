import type { Dirent } from 'node:fs';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { detectOsArch, type EngineSpec, engineBinaryName } from './engine-catalog.ts';

const FIND_BINARY_MAX_DEPTH = 5;

function rankOf(part: string): [number, number | string] {
  return /^\d+$/.test(part) ? [0, Number(part)] : [1, part];
}

function compareParts(l: [number, number | string], r: [number, number | string]): number {
  if (l[0] !== r[0]) {
    return l[0] < r[0] ? -1 : 1;
  }
  if (l[1] === r[1]) {
    return 0;
  }
  return l[1] < r[1] ? -1 : 1;
}

export function compareVersions(a: string, b: string): number {
  const left = a.split(/[.\-+]/);
  const right = b.split(/[.\-+]/);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined && r === undefined) {
      continue;
    }
    if (l === undefined || r === undefined) {
      return l === undefined ? -1 : 1;
    }
    if (l === r) {
      continue;
    }
    return compareParts(rankOf(l), rankOf(r));
  }
  return 0;
}

async function readDirents(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function findBinaryAny(dir: string, names: readonly string[]): Promise<string | null> {
  let level: string[] = [dir];
  for (let depth = 0; depth <= FIND_BINARY_MAX_DEPTH && level.length > 0; depth += 1) {
    const next: string[] = [];
    for (const current of level) {
      for (const item of await readDirents(current)) {
        const full = join(current, item.name);
        if (names.includes(item.name)) {
          return full;
        }
        if (item.isDirectory()) {
          next.push(full);
        }
      }
    }
    level = next;
  }
  return null;
}

export async function findBinary(dir: string, name: string): Promise<string | null> {
  return await findBinaryAny(dir, [name]);
}

export async function dirSize(dir: string): Promise<number> {
  const stack: string[] = [dir];
  let total = 0;
  for (let index = 0; index < stack.length; index += 1) {
    const current = stack[index];
    if (current === undefined) {
      continue;
    }
    for (const item of await readDirents(current)) {
      const full = join(current, item.name);
      if (item.isDirectory()) {
        stack.push(full);
      } else {
        try {
          total += (await stat(full)).size;
        } catch {}
      }
    }
  }
  return total;
}

function stagedBinaryNames(spec: EngineSpec): readonly string[] {
  return [engineBinaryName(spec), `${spec.id}-browser`];
}

export async function listInstalledVersions(
  engineDir: string,
  spec: EngineSpec,
): Promise<Record<string, string>> {
  const versions: Record<string, string> = {};
  for (const item of await readDirents(engineDir)) {
    if (!item.isDirectory() || item.name.startsWith('.')) {
      continue;
    }
    const binary = await resolveInstalledBinary(spec, join(engineDir, item.name));
    if (binary !== null) {
      versions[item.name] = binary;
    }
  }
  return versions;
}

export async function resolveInstalledBinary(
  spec: EngineSpec,
  versionDir: string,
): Promise<string | null> {
  const rel = spec.install?.binaryPath?.[detectOsArch()];
  if (rel !== undefined) {
    const exact = join(versionDir, rel);
    if (existsSync(exact)) {
      return exact;
    }
  }
  return await findBinaryAny(versionDir, stagedBinaryNames(spec));
}
