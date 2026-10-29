import { Injectable } from '@harnesys/brix';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourcePathInvalidException } from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';

export interface ListGitBranchesInput {
  orgId: string;
  sourceId: string;
  hostId: string;
}

export interface ListGitBranchesResult {
  branches: string[];
  activeBranch: string;
}

@Injectable()
export class ListGitBranchesUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly driver: SourceDriverPort,
    private readonly git: GitVcsPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  async execute(input: ListGitBranchesInput): Promise<ListGitBranchesResult> {
    if (input.hostId !== this.machineConfig.get().id) {
      throw new SourcePathInvalidException('git branches on a remote host is not supported yet');
    }
    const resolved = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
    });
    if (resolved.kind === 'inplace') {
      const listed = await this.git.listBranches(resolved.cwd);
      const current = listed.local.find((b) => b.current)?.name ?? '';
      return {
        branches: listed.local.map((b) => b.name),
        activeBranch: current,
      };
    }
    const list = this.driver.listLocalBranches;
    const branches = list ? await list.call(this.driver, resolved.config.layout) : [];
    return {
      branches,
      activeBranch: resolved.config.activeBranch,
    };
  }
}
