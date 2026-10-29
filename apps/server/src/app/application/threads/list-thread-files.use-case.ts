import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@harnesys/brix';
import {
  MAX_THREAD_TREE_ENTRIES,
  type ThreadFileEntry,
  type ThreadFilesTreeResponse,
} from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { resolveThreadEntryPath } from './thread-files-paths.ts';

export interface ListThreadFilesInput {
  orgId: string;
  threadId: string;
  subPath: string;
}

@Injectable()
export class ListThreadFilesUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(input: ListThreadFilesInput): Promise<ThreadFilesTreeResponse> {
    if (!this.threads.findById(input.orgId, input.threadId)) {
      throw new ThreadNotFoundException(input.threadId);
    }
    const threadDir = this.layout.threadDir(input.orgId, input.threadId);
    const base = resolveThreadEntryPath(threadDir, input.subPath);
    if (!base) {
      throw new ThreadValidationException(`subPath outside thread directory: ${input.subPath}`);
    }
    const prefix = input.subPath.replaceAll('\\', '/');
    const entries: ThreadFileEntry[] = [];
    const truncated = await walkEntries(base, prefix, entries);
    return { subPath: input.subPath, entries, ...(truncated ? { truncated: true } : {}) };
  }
}

async function walkEntries(
  absDir: string,
  relPrefix: string,
  out: ThreadFileEntry[],
): Promise<boolean> {
  let dirents: Dirent[];
  try {
    dirents = await readdir(absDir, { withFileTypes: true });
  } catch {
    return false;
  }
  let truncated = false;
  for (const dirent of [...dirents].sort(compareDirents)) {
    if (out.length >= MAX_THREAD_TREE_ENTRIES) {
      return true;
    }
    truncated = (await pushDirent(dirent, absDir, relPrefix, out)) || truncated;
  }
  return truncated;
}

async function pushDirent(
  dirent: Dirent,
  absDir: string,
  relPrefix: string,
  out: ThreadFileEntry[],
): Promise<boolean> {
  if (dirent.isSymbolicLink()) {
    return false;
  }
  const rel = relPrefix ? `${relPrefix}/${dirent.name}` : dirent.name;
  if (dirent.isDirectory()) {
    const count = await childCount(join(absDir, dirent.name));
    out.push({ name: dirent.name, path: rel, type: 'dir', ...(count == null ? {} : { count }) });
    return false;
  }
  if (!dirent.isFile()) {
    return false;
  }
  const size = await fileSizeOf(join(absDir, dirent.name));
  out.push({ name: dirent.name, path: rel, type: 'file', ...(size == null ? {} : { size }) });
  return false;
}

async function childCount(absDir: string): Promise<number | null> {
  try {
    return (await readdir(absDir, { withFileTypes: true })).length;
  } catch {
    return null;
  }
}

function compareDirents(a: Dirent, b: Dirent): number {
  if (a.isDirectory() !== b.isDirectory()) {
    return a.isDirectory() ? -1 : 1;
  }
  return a.name.localeCompare(b.name);
}

async function fileSizeOf(absPath: string): Promise<number | null> {
  try {
    return (await stat(absPath)).size;
  } catch {
    return null;
  }
}
