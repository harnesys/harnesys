import type {
  ContentReplaceSourceResult,
  ContentSearchSourceResult,
  ContentStat,
  ContentTreeResult,
} from '@harnesys/contracts';

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

export interface PatternOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export interface ContentSearchOptions extends PatternOptions {
  mask: string[];
  limit: number;
  dir?: string;
}

export interface ContentReplaceFileTarget {
  path: string;
  line?: number;
  column?: number;
  matchText?: string;
}

export interface ContentReplaceOptions extends PatternOptions {
  mask: string[];
  dir?: string;
  dryRun: boolean;
  targets?: ContentReplaceFileTarget[];
}

export interface ContentReplaceRequest {
  query: string;
  replacement: string;
  options: ContentReplaceOptions;
}

export abstract class OrgContentPort {
  abstract listTree(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
    options?: { includeIgnored?: boolean; depth?: number },
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
  abstract search(
    orgId: string,
    sourceId: string,
    query: string,
    options: ContentSearchOptions,
    worktreeId?: string,
  ): Promise<ContentSearchSourceResult>;
  abstract replace(
    orgId: string,
    sourceId: string,
    request: ContentReplaceRequest,
    worktreeId?: string,
  ): Promise<ContentReplaceSourceResult>;
}
