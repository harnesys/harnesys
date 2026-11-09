import { Controller, Param, Post, Req } from '@harnesys/brix';
import { CompactThreadUseCase } from '../../application/threads/compact-thread.use-case.ts';
import { UndoThreadCompactUseCase } from '../../application/threads/undo-thread-compact.use-case.ts';
import { OrgIdHeader } from '../org-id.ts';
import { streamCompactSse } from './thread-compact-sse.ts';

@Controller('threads')
export class ThreadCompactController {
  constructor(
    private readonly compactThread: CompactThreadUseCase,
    private readonly undoThreadCompact: UndoThreadCompactUseCase,
  ) {}

  @Post(':threadId/compact')
  compact(
    @OrgIdHeader() orgId: string,
    @Param('threadId') threadId: string,
    @Req() request: CompatRequest,
  ): Response {
    return streamCompactSse(() =>
      this.compactThread.execute({
        orgId,
        threadId,
        signal: request.req.raw.signal,
      }),
    );
  }

  @Post(':threadId/compact/undo')
  undo(@OrgIdHeader() orgId: string, @Param('threadId') threadId: string): Promise<unknown> {
    return this.undoThreadCompact.execute({ orgId, threadId });
  }
}

interface CompatRequest {
  req: { raw: Request };
}
