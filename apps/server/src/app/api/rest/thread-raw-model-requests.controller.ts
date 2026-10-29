import { Controller, Get, Param } from '@harnesys/brix';
import { GetThreadRawModelRequestUseCase } from '../../application/threads/get-thread-raw-model-request.use-case.ts';
import { ListThreadRawModelRequestsUseCase } from '../../application/threads/list-thread-raw-model-requests.use-case.ts';
import { OrgIdHeader } from '../org-id.ts';

@Controller('threads')
export class ThreadRawModelRequestsController {
  constructor(
    private readonly list: ListThreadRawModelRequestsUseCase,
    private readonly get: GetThreadRawModelRequestUseCase,
  ) {}

  @Get(':threadId/raw-model-requests')
  async listRequests(@OrgIdHeader() orgId: string, @Param('threadId') threadId: string) {
    return { items: await this.list.execute(orgId, threadId) };
  }

  @Get(':threadId/raw-model-requests/:name')
  async getRequest(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Param('name') name: string,
  ) {
    return this.get.execute(orgId, threadId, name);
  }
}
