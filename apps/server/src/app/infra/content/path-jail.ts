import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

export class PathJailEscapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathJailEscapeError';
  }
}

function rootPrefix(root: string): string {
  return root.endsWith(sep) ? root : `${root}${sep}`;
}

function assertUnderRoot(root: string, candidate: string): void {
  if (candidate === root) {
    return;
  }
  if (!candidate.startsWith(rootPrefix(root))) {
    throw new PathJailEscapeError('path escapes source root');
  }
}

function realOrSelf(path: string): string {
  if (!existsSync(path)) {
    return path;
  }
  try {
    return realpathSync(path);
  } catch {
    throw new PathJailEscapeError('unable to resolve real path');
  }
}

export function resolveSafe(root: string, relPath: string): string {
  const rootResolved = resolve(root);
  const rootReal = realOrSelf(rootResolved);
  const raw = relPath.replaceAll('\\', '/');
  if (raw.includes('\0')) {
    throw new PathJailEscapeError('null byte in path');
  }
  if (raw !== '' && (isAbsolute(raw) || /^[A-Za-z]:/.test(raw))) {
    throw new PathJailEscapeError('absolute path rejected');
  }
  const segments = raw.split('/').filter((part) => part !== '' && part !== '.');
  for (const segment of segments) {
    if (segment === '..') {
      throw new PathJailEscapeError('parent segment rejected');
    }
  }
  const joined = resolve(rootReal, ...segments);
  assertUnderRoot(rootReal, joined);

  let cursor = rootReal;
  for (const segment of segments) {
    cursor = resolve(cursor, segment);
    if (!existsSync(cursor)) {
      break;
    }
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) {
      const real = realOrSelf(cursor);
      assertUnderRoot(rootReal, real);
    }
  }
  if (existsSync(joined)) {
    assertUnderRoot(rootReal, realOrSelf(joined));
  }
  return joined;
}
