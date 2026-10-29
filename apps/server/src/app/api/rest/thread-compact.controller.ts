import { Controller, Param, Post } from '@harnesys/brix';
import { CompactThreadUseCase } from '../../application/threads/compact-thread.use-case.ts';
import { OrgIdHeader } from '../org-id.ts';
import { streamCompactSse } from './thread-compact-sse.ts';

@Controller('threads')
export class ThreadCompactController {
  constructor(private readonly compactThread: CompactThreadUseCase) {}

  @Post(':threadId/compact')
  compact(@OrgIdHeader() orgId: string, @Param('threadId') threadId: string): Response {
    return streamCompactSse(() => this.compactThread.execute({ orgId, threadId }));
  }
}
