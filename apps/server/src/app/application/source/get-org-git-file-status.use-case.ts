import { Injectable } from '@harnesys/brix';
import type { GitOrgFileStatus } from '@harnesys/studio-shared';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';

export interface GetOrgGitFileStatusInput {
  orgId: string;
}

@Injectable()
export class GetOrgGitFileStatusUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: GetOrgGitFileStatusInput): Promise<GitOrgFileStatus[]> {
    const records = this.sources.list(input.orgId).filter((record) => hasGitVcs(record));
    return Promise.all(records.map((record) => this.fileStatusOne(input.orgId, record.id)));
  }

  private async fileStatusOne(orgId: string, sourceId: string): Promise<GitOrgFileStatus> {
    try {
      const { cwd } = this.worktrees.resolve(orgId, sourceId);
      const { map, truncated } = await this.git.getFileStatus(cwd);
      return { sourceId, map, truncated };
    } catch {
      return { sourceId, map: {}, truncated: false };
    }
  }
}
