import type { ContentStat, ContentTreeResult } from '@harnesys/contracts';

export interface ContentReadResult {
  bytes: Uint8Array;
  etag: string;
  size: number;
  mtime: string;
}

export interface ContentWriteResult {
  etag: string;
}

export interface ContentDownload {
  name: string;
  bytes: Uint8Array;
}

export abstract class OrgContentPort {
  abstract listTree(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentTreeResult>;
  abstract read(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentReadResult>;
  abstract write(
    orgId: string,
    sourceId: string,
    relPath: string,
    bytes: Uint8Array,
    options?: { ifMatch?: string | null; worktreeId?: string },
  ): Promise<ContentWriteResult>;
  abstract mkdir(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract remove(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract move(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract copy(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract importPaths(
    orgId: string,
    sourceId: string,
    fromAbs: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract stat(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat>;
  abstract duplicate(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat>;
  abstract reveal(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<void>;
  abstract download(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentDownload>;
}
