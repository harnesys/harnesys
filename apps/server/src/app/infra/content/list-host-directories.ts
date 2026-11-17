import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { HostDirectoryListing } from '../../domain/content/host-directory.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';

export type {
  HostDirectoryEntry,
  HostDirectoryListing,
} from '../../domain/content/host-directory.ts';

export function listHostDirectories(path?: string): HostDirectoryListing {
  const trimmed = path?.trim() ?? '';
  const dir = resolve(trimmed.length > 0 ? expandHome(trimmed) : homedir());
  try {
    const dirents = readdirSync(dir, { withFileTypes: true });
    const entries = dirents
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => ({
        name: entry.name,
        path: join(dir, entry.name),
        kind: entry.isDirectory() ? ('dir' as const) : ('file' as const),
      }))
      .sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    const parent = dirname(dir);
    return {
      path: dir,
      parent: parent === dir ? null : parent,
      entries,
    };
  } catch {
    throw new SourcePathInvalidException(`directory unavailable: ${dir}`);
  }
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
