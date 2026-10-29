import { Injectable } from '@harnesys/brix';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import {
  SourceMaterializationAbsentException,
  SourceNotFoundException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';
import { refreshSourceVcs } from './refresh-source-vcs.ts';

export interface InitGitInput {
  orgId: string;
  sourceId: string;
  hostId: string;
}

export interface InitGitResult {
  ok: true;
}

@Injectable()
export class InitGitUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: InitGitInput): Promise<InitGitResult> {
    const row = this.sources.findById(input.orgId, input.sourceId);
    if (!row) {
      throw new SourceNotFoundException(input.sourceId);
    }
    const localHostId = this.machineConfig.get().id;
    if (row.distribution.kind !== 'host-bound' || row.distribution.hostId !== input.hostId) {
      throw new SourcePathInvalidException('init is only supported on the origin host');
    }
    if (input.hostId !== localHostId) {
      throw new SourcePathInvalidException('init is only supported on the local host');
    }
    const mat = this.materializations.find(input.orgId, input.sourceId, input.hostId);
    if (mat?.state !== 'ready' || mat.localPath === null) {
      throw new SourceMaterializationAbsentException(input.sourceId, input.hostId);
    }
    try {
      await this.git.init(mat.localPath);
    } catch (err) {
      return mapGitVcsError(err);
    }
    this.sources.updateVcs(input.orgId, input.sourceId, {
      engine: 'git',
      remoteUrl: null,
      credRef: null,
      defaultBranch: null,
    });
    await refreshSourceVcs(
      {
        sources: this.sources,
        materializations: this.materializations,
        git: this.git,
        localHostId,
      },
      input.orgId,
      input.sourceId,
    );
    return { ok: true };
  }
}
