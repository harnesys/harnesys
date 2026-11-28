import { Body, Controller, Param, Patch } from '@harnesys/brix';
import type { ThreadSummary, UpdateThreadIssueBody } from '@harnesys/contracts';
import { UpdateThreadIssueBodySchema } from '@harnesys/contracts';
import { UpdateThreadIssueUseCase } from '../../application/threads/update-thread-issue.use-case.ts';

@Controller('orgs/:orgId/threads')
export class ThreadIssueController {
  constructor(private readonly updateThreadIssue: UpdateThreadIssueUseCase) {}

  @Patch(':threadId/issue')
  updateIssue(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Body(UpdateThreadIssueBodySchema) body: UpdateThreadIssueBody,
  ): ThreadSummary {
    return this.updateThreadIssue.execute({ orgId, threadId, body });
  }
}
