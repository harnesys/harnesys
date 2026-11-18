import { Controller, Get, Param } from '@harnesys/brix';
import { GetGitMachineInfoUseCase } from '../../application/source/get-git-machine-info.use-case.ts';
import { GetOrgGitSummaryUseCase } from '../../application/source/get-org-git-summary.use-case.ts';
import type { GitSourceSummary } from '../../application/source/git-summary.util.ts';
import type { GitMachineInfo } from '../../domain/source/git-vcs.port.ts';

@Controller('orgs/:orgId/git')
export class OrgGitController {
  constructor(
    private readonly getOrgGitSummary: GetOrgGitSummaryUseCase,
    private readonly getGitMachineInfo: GetGitMachineInfoUseCase,
  ) {}

  @Get('summary')
  summary(@Param('orgId') orgId: string): Promise<GitSourceSummary[]> {
    return this.getOrgGitSummary.execute({ orgId });
  }

  @Get('machine')
  machine(): Promise<GitMachineInfo> {
    return this.getGitMachineInfo.execute();
  }
}
