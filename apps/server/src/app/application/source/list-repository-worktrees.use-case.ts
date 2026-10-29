import { Injectable } from '@harnesys/brix';
import type { ListRepositoryWorktreesResponse } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import {
  SourceDriverMismatchException,
  SourceNotFoundException,
} from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { toPublicWorktree } from './to-public-worktree.ts';

export interface ListRepositoryWorktreesInput {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class ListRepositoryWorktreesUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
  ) {}

  async execute(input: ListRepositoryWorktreesInput): Promise<ListRepositoryWorktreesResponse> {
    const source = this.sources.findById(input.orgId, input.sourceId);
    if (!source) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(source)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const rows = this.worktrees
      .listForSource(input.orgId, input.sourceId)
      .filter((row) => row.state !== 'failed');
    const localHostId = this.machineConfig.get().id;
    const worktrees = [];
    for (const row of rows) {
      if (row.hostId !== localHostId || row.state !== 'ready') {
        worktrees.push(toPublicWorktree(row, null));
        continue;
      }
      const gitLayout = {
        bareRepoPath: this.layout.orgSourceDir(input.orgId, input.sourceId),
        worktreesRoot: this.layout.sourceWorktreesDir(input.orgId, input.sourceId),
      };
      const observation = await this.driver.observeWorktree(gitLayout, row.id).catch(() => null);
      worktrees.push(toPublicWorktree(row, observation));
    }
    return { worktrees };
  }
}
