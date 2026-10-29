import { Injectable } from '@harnesys/brix';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitFileStatusMap } from '../../domain/source/git-vcs.types.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface GetGitFileStatusInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  path?: string;
}

export interface GetGitFileStatusResult {
  map: GitFileStatusMap;
  truncated: boolean;
}

@Injectable()
export class GetGitFileStatusUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetGitFileStatusInput): Promise<GetGitFileStatusResult> {
    const record = this.sources.findById(input.orgId, input.sourceId);
    if (!record) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(record)) {
      return { map: {}, truncated: false };
    }
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    try {
      return await this.git.getFileStatus(cwd, input.path);
    } catch (err) {
      return mapGitVcsError(err);
    }
  }
}
