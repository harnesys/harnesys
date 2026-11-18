import { Injectable } from '@harnesys/brix';
import type { GitMachineInfo } from '../../domain/source/git-vcs.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';

@Injectable()
export class GetGitMachineInfoUseCase {
  constructor(private readonly git: GitVcsPort) {}

  execute(): Promise<GitMachineInfo> {
    return this.git.getMachineInfo();
  }
}
