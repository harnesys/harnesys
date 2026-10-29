import { Injectable } from '@harnesys/brix';
import type { SourceVcs } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { refreshSourceVcs, type SourceVcsRefresherDeps } from './refresh-source-vcs.ts';

export interface RefreshSourceVcsInput {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class RefreshSourceVcsUseCase {
  constructor(
    private readonly sources: SourceRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly git: GitVcsPort,
  ) {}

  async execute(input: RefreshSourceVcsInput): Promise<{ vcs: SourceVcs | null }> {
    const vcs = await refreshSourceVcs(this.deps(), input.orgId, input.sourceId);
    return { vcs };
  }

  private deps(): SourceVcsRefresherDeps {
    return {
      sources: this.sources,
      materializations: this.materializations,
      git: this.git,
      localHostId: this.machineConfig.get().id,
    };
  }
}
