import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { type ResolvedGitWorktree, resolveGitWorktree } from './resolve-git-worktree.ts';

@Injectable()
export class GitWorktreeResolver {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  resolve(
    orgId: string,
    sourceId: string,
    options?: { hostId?: string; worktreeId?: string },
  ): ResolvedGitWorktree {
    const hostId = options?.hostId?.trim() || this.machineConfig.get().id;
    return resolveGitWorktree(
      {
        sources: this.sources,
        materializations: this.materializations,
        layout: this.layout,
        hostId,
      },
      orgId,
      sourceId,
      { worktreeId: options?.worktreeId },
    );
  }
}
