import { Injectable } from '@harnesys/brix';
import type { ContentStat, ContentTreeResult } from '@harnesys/contracts';
import {
  type ContentDownload,
  type ContentReadResult,
  type ContentWriteResult,
  OrgContentPort,
} from '../../domain/content/org-content.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import {
  downloadAt,
  duplicateAt,
  listTreeAt,
  mkdirAt,
  moveAt,
  readAt,
  removeAt,
  revealAt,
  statAt,
  writeAt,
} from './fs-content-ops.ts';
import { copyAt, importAt } from './fs-copy-ops.ts';
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

  listTree(
    orgId: string,
    sourceId: string,
    relPath: string,
    worktreeId?: string,
  ): Promise<ContentTreeResult> {
    return Promise.resolve(listTreeAt(this.contentRoot(orgId, sourceId, worktreeId), relPath));
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
