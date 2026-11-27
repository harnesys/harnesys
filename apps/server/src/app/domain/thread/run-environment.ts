import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { RunEnvironment } from '@harnesys/contracts';
import { ThreadValidationException } from './thread.error.ts';

export interface MaterializePrimaryInput {
  anchorRoot: string | null;
  threadDir: string;
}

export interface MaterializedPrimary {
  primaryDirectory: string;
  primaryKind: 'sandbox' | 'directory' | 'worktree' | 'source';
}

const SYSTEM_ROOTS = [
  '/',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/proc',
  '/root',
  '/sbin',
  '/sys',
  '/usr',
  '/var',
  '/System',
  '/Library',
];

export function assertRelativeSubpath(subpath: string): void {
  if (isAbsolute(subpath)) {
    throw new ThreadValidationException(`workspace subpath must be relative: ${subpath}`);
  }
  const segments = subpath.split(/[\\/]+/);
  if (segments.includes('..')) {
    throw new ThreadValidationException(`workspace subpath escapes the workspace root: ${subpath}`);
  }
}

export function assertFolderAllowed(protectedRoots: readonly string[], folderPath: string): void {
  const target = resolve(folderPath);
  for (const candidate of [...protectedRoots, ...SYSTEM_ROOTS]) {
    const root = resolve(candidate);
    const rejected = root === '/' ? target === '/' : isInside(root, target);
    if (rejected) {
      throw new ThreadValidationException(
        `workspace folder must be outside protected roots: ${folderPath}`,
      );
    }
  }
}

export function materializePrimary(
  environment: RunEnvironment,
  input: MaterializePrimaryInput,
): MaterializedPrimary {
  const anchor = environment.anchor;
  if (environment.cwd === 'sandbox' || anchor === null) {
    return { primaryDirectory: input.threadDir, primaryKind: 'sandbox' };
  }
  const anchorRoot = input.anchorRoot;
  if (anchorRoot === null) {
    throw new ThreadValidationException('workspace anchor root is unavailable');
  }
  if (anchor.kind === 'folder') {
    return { primaryDirectory: anchorRoot, primaryKind: 'directory' };
  }
  const primaryDirectory =
    environment.subpath !== undefined ? join(anchorRoot, environment.subpath) : anchorRoot;
  return {
    primaryDirectory,
    primaryKind: anchor.worktreeId !== undefined ? 'worktree' : 'source',
  };
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}
