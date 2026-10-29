import { Injectable } from '@harnesys/brix';
import type { Source } from '@harnesys/contracts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import {
  SourceDriverMismatchException,
  SourceMaterializationAbsentException,
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceDriverPort } from '../../domain/source/source-driver.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hasGitVcs } from '../../domain/source/vcs-capability.ts';
import { resolveStandaloneRepoRoot } from './resolve-git-worktree.ts';
import { toPublicSource } from './to-public-source.ts';

export interface DeleteGitBranchInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  branch: string;
}

@Injectable()
export class DeleteGitBranchUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly layout: HostFsLayoutPort,
    private readonly driver: SourceDriverPort,
  ) {}

  async execute(input: DeleteGitBranchInput): Promise<Source> {
    const branch = input.branch.trim();
    if (!branch) {
      throw new SourcePathInvalidException('branch is required');
    }
    if (input.hostId !== this.machineConfig.get().id) {
      throw new SourcePathInvalidException(
        'git branch delete on a remote host is not supported yet',
      );
    }
    const record = this.sources.findById(input.orgId, input.sourceId);
    if (!record) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(record)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const mat = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    if (mat?.state !== 'ready') {
      throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
    }
    const repoRoot = resolveStandaloneRepoRoot({
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: mat.origin,
      localPath: mat.localPath,
      managedBarePath: this.layout.orgSourceDir(input.orgId, input.sourceId),
    });
    await this.driver.deleteLocalBranch(
      {
        bareRepoPath: repoRoot,
        worktreesRoot: this.layout.sourceWorktreesDir(input.orgId, input.sourceId),
      },
      branch,
    );
    return toPublicSource(record, new Date().toISOString());
  }
}
