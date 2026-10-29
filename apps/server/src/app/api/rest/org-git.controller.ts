import { Controller, Get, Param } from '@harnesys/brix';
import { GetOrgGitSummaryUseCase } from '../../application/source/get-org-git-summary.use-case.ts';
import type { GitSourceSummary } from '../../application/source/git-summary.util.ts';

@Controller('orgs/:orgId/git')
export class OrgGitController {
  constructor(private readonly getOrgGitSummary: GetOrgGitSummaryUseCase) {}

  @Get('summary')
  summary(@Param('orgId') orgId: string): Promise<GitSourceSummary[]> {
    return this.getOrgGitSummary.execute({ orgId });
  }
}
