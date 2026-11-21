import { Body, Controller, Get, Param, Put } from '@harnesys/brix';
import type { GitIdentityBody } from '@harnesys/contracts';
import { GitIdentityBodySchema } from '@harnesys/contracts';
import { GetGitMachineInfoUseCase } from '../../application/source/get-git-machine-info.use-case.ts';
import { GetOrgGitSummaryUseCase } from '../../application/source/get-org-git-summary.use-case.ts';
import type { GitSourceSummary } from '../../application/source/git-summary.util.ts';
import { SetGitIdentityUseCase } from '../../application/source/set-git-identity.use-case.ts';
import type { GitMachineInfo } from '../../domain/source/git-vcs.port.ts';

@Controller('orgs/:orgId/git')
export class OrgGitController {
  constructor(
    private readonly getOrgGitSummary: GetOrgGitSummaryUseCase,
    private readonly getGitMachineInfo: GetGitMachineInfoUseCase,
    private readonly setGitIdentity: SetGitIdentityUseCase,
  ) {}

  @Get('summary')
  summary(@Param('orgId') orgId: string): Promise<GitSourceSummary[]> {
    return this.getOrgGitSummary.execute({ orgId });
  }

  @Get('machine')
  machine(): Promise<GitMachineInfo> {
    return this.getGitMachineInfo.execute();
  }

  @Put('machine')
  machinePut(@Body(GitIdentityBodySchema) body: GitIdentityBody): Promise<GitMachineInfo> {
    return this.setGitIdentity.execute(body);
  }
}
