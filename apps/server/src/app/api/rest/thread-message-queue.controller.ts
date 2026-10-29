import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@harnesys/brix';
import {
  type ThreadMessageEnqueueRequest,
  type ThreadMessageQueueItemRequest,
  type ThreadMessageQueueRequest,
  type ThreadMessageQueueResponse,
  ThreadMessageQueueUseCase,
} from '../../application/threads/thread-message-queue.use-case.ts';
import { OrgIdHeader } from '../org-id.ts';
import {
  type ThreadQueueEnqueueBody,
  ThreadQueueEnqueueBodySchema,
} from './thread-message-queue.schema.ts';

@Controller('threads')
export class ThreadMessageQueueController {
  constructor(private readonly queue: ThreadMessageQueueUseCase) {}

  @Get(':threadId/queue')
  list(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
  ): Promise<ThreadMessageQueueResponse> {
    const request: ThreadMessageQueueRequest = { orgId, threadId };
    return this.queue.list(request);
  }

  @Post(':threadId/queue')
  @HttpCode(200)
  enqueue(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Body(ThreadQueueEnqueueBodySchema) body: ThreadQueueEnqueueBody,
  ): Promise<ThreadMessageQueueResponse> {
    const request: ThreadMessageEnqueueRequest = { orgId, threadId, body };
    return this.queue.enqueue(request);
  }

  @Delete(':threadId/queue/:itemId')
  @HttpCode(204)
  remove(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const request: ThreadMessageQueueItemRequest = { orgId, threadId, itemId };
    return this.queue.remove(request);
  }

  @Post(':threadId/queue/:itemId/deliver')
  @HttpCode(200)
  deliver(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Param('itemId') itemId: string,
  ): Promise<ThreadMessageQueueResponse> {
    const request: ThreadMessageQueueItemRequest = { orgId, threadId, itemId };
    return this.queue.deliver(request);
  }
}
