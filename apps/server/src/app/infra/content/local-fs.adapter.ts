import { Injectable } from '@harnesys/brix';
import type {
  ContentReplaceSourceResult,
  ContentSearchSourceResult,
  ContentStat,
  ContentTreeResult,
} from '@harnesys/contracts';
import {
  type ContentDownload,
  type ContentReadResult,
  type ContentReplaceRequest,
  type ContentSearchOptions,
  type ContentWriteResult,
  OrgContentPort,
} from '../../domain/content/org-content.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import {
  downloadAt,
  duplicateAt,
  mkdirAt,
  moveAt,
  readAt,
  removeAt,
  revealAt,
  statAt,
  writeAt,
} from './fs-content-ops.ts';
import { replaceSourceAt } from './fs-content-replace.ts';
import { searchSourceAt } from './fs-content-search.ts';
import { copyAt, importAt } from './fs-copy-ops.ts';
import { listTreeAt } from './fs-tree-walk.ts';
import { resolveWorktreeContentRoot } from './worktree-content-root.ts';

@Injectable()
export class LocalFsContentAdapter extends OrgContentPort {
  constructor(
    private readonly sourceLocation: SourceLocationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
  ) {
    super();
  }

  async listTree(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
    options?: { includeIgnored?: boolean; depth?: number },
  ): Promise<ContentTreeResult> {
    return await listTreeAt(this.contentRoot(orgId, sourceId, worktreeId), relPath, options);
  }

  read(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentReadResult> {
    return Promise.resolve(readAt(this.contentRoot(orgId, sourceId, worktreeId), relPath));
  }

  write(
    orgId: string,
    sourceId: string,
    relPath: string,
    bytes: Uint8Array,
    options?: { ifMatch?: string | null; worktreeId?: string },
  ): Promise<ContentWriteResult> {
    return Promise.resolve(
      writeAt(
        this.contentRoot(orgId, sourceId, options?.worktreeId),
        relPath,
        bytes,
        options?.ifMatch,
      ),
    );
  }

  mkdir(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    mkdirAt(this.contentRoot(orgId, sourceId, worktreeId), relPath);
    return Promise.resolve();
  }

  remove(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    removeAt(this.contentRoot(orgId, sourceId, worktreeId), relPath);
    return Promise.resolve();
  }

  move(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    moveAt(this.contentRoot(orgId, sourceId, worktreeId), fromRel, toRel);
    return Promise.resolve();
  }

  copy(
    orgId: string,
    sourceId: string,
    fromRel: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    copyAt(this.contentRoot(orgId, sourceId, worktreeId), fromRel, toRel);
    return Promise.resolve();
  }

  importPaths(
    orgId: string,
    sourceId: string,
    fromAbs: string,
    toRel: string,
    worktreeId?: string,
  ): Promise<void> {
    importAt(this.contentRoot(orgId, sourceId, worktreeId), fromAbs, toRel);
    return Promise.resolve();
  }

  stat(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat> {
    return Promise.resolve(statAt(this.contentRoot(orgId, sourceId, worktreeId), relPath));
  }

  duplicate(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentStat> {
    return Promise.resolve(duplicateAt(this.contentRoot(orgId, sourceId, worktreeId), relPath));
  }

  reveal(orgId: string, sourceId: string, relPath: string, worktreeId?: string): Promise<void> {
    revealAt(this.contentRoot(orgId, sourceId, worktreeId), relPath);
    return Promise.resolve();
  }

  download(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentDownload> {
    return Promise.resolve(downloadAt(this.contentRoot(orgId, sourceId, worktreeId), relPath));
  }

  search(
    orgId: string,
    sourceId: string,
    query: string,
    options: ContentSearchOptions,
    worktreeId?: string,
  ): Promise<ContentSearchSourceResult> {
    return searchSourceAt(
      sourceId,
      this.contentRoot(orgId, sourceId, worktreeId),
      options.dir ?? '',
      query,
      options,
    );
  }

  replace(
    orgId: string,
    sourceId: string,
    request: ContentReplaceRequest,
    worktreeId?: string,
  ): Promise<ContentReplaceSourceResult> {
    return replaceSourceAt(
      this.contentRoot(orgId, sourceId, worktreeId),
      request.options.dir ?? '',
      request.query,
      request.replacement,
      request.options,
    );
  }

  contentRoot(orgId: string, sourceId: string, worktreeId?: string): string {
    if (worktreeId !== undefined) {
      return resolveWorktreeContentRoot(
        this.layout.sourceWorktreesDir(orgId, sourceId),
        worktreeId,
      );
    }
    return this.sourceLocation.resolve({
      orgId,
      sourceId,
      hostId: this.machineConfig.get().id,
    }).absoluteRoot;
  }
}
