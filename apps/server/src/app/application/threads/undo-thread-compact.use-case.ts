import { Injectable } from '@harnesys/brix';
import type { UndoCompactResponse } from '@harnesys/contracts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadInvariantException,
  ThreadNotFoundException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import type { ThreadLogDeletion } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface UndoThreadCompactRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class UndoThreadCompactUseCase {
  constructor(
    private readonly executor: LocalExecutorPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
    private readonly assembler: ThreadSummaryAssembler,
    private readonly threadEvents: ThreadEventsPort,
  ) {}

  async execute(request: UndoThreadCompactRequest): Promise<UndoCompactResponse> {
    const removed = await this.executor.undoThreadCompact(request.orgId, request.threadId);
    const removedThreadSeq = removed.threadSeq;
    if (removedThreadSeq === undefined) {
      throw new ThreadInvariantException(
        `undo compact removed no sequenced event in thread ${request.threadId}`,
        { threadId: request.threadId },
      );
    }
    const cursor = (
      await this.history.syncSlice(request.orgId, request.threadId, removedThreadSeq, 1)
    ).serverMax;
    const deletions: ThreadLogDeletion[] = [{ from: removedThreadSeq, to: removedThreadSeq }];
    this.threadEvents.emit(request.orgId, {
      type: 'log-changed',
      threadId: request.threadId,
      deletions,
      serverMax: cursor,
    });
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const waitingForProfileId = await this.history.waitingForProfileId(
      request.orgId,
      request.threadId,
    );
    const summary = await this.assembler.execute({
      orgId: request.orgId,
      thread,
      waitingForProfileId,
    });
    return { removedThreadSeq, summary, cursor };
  }
}
