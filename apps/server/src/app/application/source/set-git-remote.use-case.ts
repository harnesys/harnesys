import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import {
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';
import { toPublicSource } from './to-public-source.ts';

export interface SetGitRemoteInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  url: string;
  credRef?: string;
}

@Injectable()
export class SetGitRemoteUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: SetGitRemoteInput): Promise<Source> {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    const resolved = this.worktrees.resolve(input.orgId, input.sourceId, { hostId: input.hostId });
    if (resolved.kind !== 'inplace') {
      throw new SourcePathInvalidException('git remote is only supported for host-bound sources');
    }
    try {
      await this.git.setRemote(resolved.cwd, 'origin', input.url);
    } catch (err) {
      return mapGitVcsError(err);
    }
    const vcs = {
      engine: 'git' as const,
      remoteUrl: input.url,
      credRef: input.credRef ?? row.vcs?.credRef ?? null,
      defaultBranch: row.vcs?.defaultBranch ?? null,
    };
    this.sources.updateVcs(input.orgId, input.sourceId, vcs);
    return toPublicSource({ ...row, vcs }, new Date().toISOString());
  }
}
