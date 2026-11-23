import { Controller, Get, Param, Query } from '@harnesys/brix';
import type { ThreadSyncQuery, ThreadSyncResponse } from '@harnesys/contracts';
import { ThreadSyncQuerySchema } from '@harnesys/contracts';
import { SyncThreadEventsUseCase } from '../../application/threads/sync-thread-events.use-case.ts';
import type { Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';

@Controller('orgs/:orgId/threads')
export class ThreadSyncController {
  constructor(private readonly syncThreadEvents: SyncThreadEventsUseCase) {}

  @Get(':threadId/sync')
  sync(
    @Param('orgId') orgId: string,
    @Param('threadId') threadId: string,
    @Query(ThreadSyncQuerySchema) query: ThreadSyncQuery,
    @SessionPrincipal() principal: Principal,
  ): Promise<ThreadSyncResponse> {
    return this.syncThreadEvents.execute({
      orgId,
      threadId,
      afterThreadSeq: query.afterThreadSeq,
      ...(principal.kind === 'user' ? { userId: principal.userId } : {}),
    });
  }
}
