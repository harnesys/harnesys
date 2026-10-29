import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

function realpathOrResolve(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}
function canonicalPath(target: string): string {
  let current = path.resolve(target);
  const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(target);
    }
    suffix.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(realpathOrResolve(current), ...suffix);
}
function isWithin(workdir: string, resolved: string): boolean {
  if (resolved === workdir) {
    return true;
  }
  const prefix = workdir.endsWith(path.sep) ? workdir : `${workdir}${path.sep}`;
  return resolved.startsWith(prefix);
}

export function resolveWorkdirPath(cwd: string, target: string, root?: string): string {
  const workdir = realpathOrResolve(path.resolve(cwd));
  const jail = root ? realpathOrResolve(path.resolve(root)) : workdir;
  const absolute = path.isAbsolute(target) ? path.resolve(target) : path.resolve(workdir, target);
  const canonical = canonicalPath(absolute);
  if (!isWithin(jail, canonical) || !isWithin(workdir, canonical)) {
    throw new Error(`Path escapes workdir: ${target}`);
  }
  return canonical;
}

export function resolveAllowedPath(
  cwd: string,
  target: string,
  allowedRoots: string[],
  root?: string,
): string {
  const workdir = realpathOrResolve(path.resolve(cwd));
  const absolute = path.isAbsolute(target) ? path.resolve(target) : path.resolve(workdir, target);
  const canonical = canonicalPath(absolute);
  if (isWithin(workdir, canonical)) {
    const jail = root ? realpathOrResolve(path.resolve(root)) : workdir;
    if (!isWithin(jail, canonical)) {
      throw new Error(`Path escapes workdir: ${target}`);
    }
    return canonical;
  }
  for (const candidate of allowedRoots) {
    if (isWithin(realpathOrResolve(path.resolve(candidate)), canonical)) {
      return canonical;
    }
  }
  throw new Error(
    `Path escapes workdir: ${target} — use a path relative to the run workdir or a path inside one of the allowed roots`,
  );
}

export function canonicalizePath(cwd: string, target: string): string {
  const workdir = realpathOrResolve(path.resolve(cwd));
  const absolute = path.isAbsolute(target) ? path.resolve(target) : path.resolve(workdir, target);
  return canonicalPath(absolute);
}
