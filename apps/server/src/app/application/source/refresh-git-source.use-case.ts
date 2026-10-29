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
import { toPublicSource } from './to-public-source.ts';

export interface RefreshGitSourceInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId?: string;
}

@Injectable()
export class RefreshGitSourceUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly driver: SourceDriverPort,
  ) {}

  async execute(input: RefreshGitSourceInput): Promise<Source> {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    if (!hasGitVcs(row)) {
      throw new SourceDriverMismatchException(input.sourceId, 'git', 'no-vcs');
    }
    const localHostId = this.machineConfig.get().id;
    if (input.hostId !== localHostId) {
      throw new SourcePathInvalidException(
        'git refresh on a remote host must use SOURCE_REFRESH prepare flow',
      );
    }
    const materialization = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    if (!materialization || materialization.state === 'absent') {
      throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
    }
    const gitLayout = {
      bareRepoPath: this.layout.orgSourceDir(input.orgId, input.sourceId),
      worktreesRoot: this.layout.sourceWorktreesDir(input.orgId, input.sourceId),
    };
    const worktreeId =
      input.worktreeId?.trim() ||
      (materialization.localPath ? basenameId(materialization.localPath) : '');
    if (!worktreeId) {
      throw new SourcePathInvalidException('worktreeId is required');
    }
    const activeBranch = row.vcs?.defaultBranch?.trim() || 'main';
    await this.driver.refresh(gitLayout, worktreeId, activeBranch);
    const contentRoot = this.driver.resolveContentRoot(gitLayout, worktreeId);
    const updatedAt = new Date().toISOString();
    this.materializations.upsert({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId: input.hostId,
      origin: 'managed',
      localPath: contentRoot,
      state: 'ready',
      revision: materialization.revision + 1,
      updatedAt,
    });
    return toPublicSource(row, updatedAt);
  }
}

function basenameId(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}
