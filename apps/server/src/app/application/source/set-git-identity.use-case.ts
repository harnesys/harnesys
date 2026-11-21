import { Injectable } from '@harnesys/brix';
import type { GitMachineInfo } from '../../domain/source/git-vcs.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';

export interface SetGitIdentityRequest {
  userName: string;
  userEmail: string;
}

@Injectable()
export class SetGitIdentityUseCase {
  constructor(private readonly git: GitVcsPort) {}

  execute(request: SetGitIdentityRequest): Promise<GitMachineInfo> {
    return this.git.setIdentity({ userName: request.userName, userEmail: request.userEmail });
  }
}
