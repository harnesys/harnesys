import { Injectable } from '@harnesys/brix';
import {
  THREAD_SYNC_MAX_DELETIONS,
  THREAD_SYNC_MAX_EVENTS,
  type ThreadSyncResponse,
} from '@harnesys/contracts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { projectThreadEvents } from './thread-events-projection.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface SyncThreadEventsRequest {
  orgId: string;
  threadId: string;
  afterThreadSeq: number;
  userId?: string;
}

@Injectable()
export class SyncThreadEventsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
    private readonly assembler: ThreadSummaryAssembler,
  ) {}

  async execute(request: SyncThreadEventsRequest): Promise<ThreadSyncResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const slice = await this.history.syncSlice(
      request.orgId,
      request.threadId,
      request.afterThreadSeq,
      THREAD_SYNC_MAX_EVENTS + 1,
    );
    const waitingForProfileId = await this.history.waitingForProfileId(
      request.orgId,
      request.threadId,
    );
    const summary = await this.assembler.execute({
      orgId: request.orgId,
      thread,
      waitingForProfileId,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
    });
    if (slice.deletions.length > THREAD_SYNC_MAX_DELETIONS) {
      return {
        reset: true,
        summary,
        events: [],
        cursor: slice.serverMax,
        hasMore: false,
        deletions: [],
      };
    }
    const hasMore = slice.rows.length > THREAD_SYNC_MAX_EVENTS;
    const rows = hasMore ? slice.rows.slice(0, THREAD_SYNC_MAX_EVENTS) : slice.rows;
    const events = projectThreadEvents(rows);
    const lastRowSeq = rows.reduce((max, row) => Math.max(max, row.threadSeq ?? 0), 0);
    const cursor = Math.max(slice.serverMax, lastRowSeq);
    return { reset: false, summary, events, cursor, hasMore, deletions: slice.deletions };
  }
}
