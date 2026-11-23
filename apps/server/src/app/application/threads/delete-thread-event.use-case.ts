import { Injectable } from '@harnesys/brix';
import type { DeleteThreadEventResponse } from '@harnesys/contracts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadEventsPort } from '../../domain/thread/thread-events.port.ts';
import type { ThreadLogDeletion } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface DeleteThreadEventRequest {
  orgId: string;
  threadId: string;
  threadSeq: number;
  userId?: string;
}

const DELETABLE_ERROR_TYPES = new Set(['error', 'run.failed']);

@Injectable()
export class DeleteThreadEventUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
    private readonly assembler: ThreadSummaryAssembler,
    private readonly executor: LocalExecutorPort,
    private readonly threadEvents: ThreadEventsPort,
  ) {}

  async execute(request: DeleteThreadEventRequest): Promise<DeleteThreadEventResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const events = await this.executor.events(request.orgId);
    const target = await events.eventAt(request.threadId, request.threadSeq);
    if (!target) {
      throw new ThreadNotFoundException(`${request.threadId}:${request.threadSeq}`);
    }
    const truncating = target.type === 'user';
    if (!truncating && !DELETABLE_ERROR_TYPES.has(target.type)) {
      throw new ThreadValidationException('only user and error events can be deleted');
    }
    if (truncating) {
      await this.executor.truncateThreadFrom(request.orgId, request.threadId, request.threadSeq);
    } else {
      await this.executor.removeThreadEvent(request.orgId, request.threadId, request.threadSeq);
    }
    this.threads.touch(request.orgId, request.threadId);
    const cursor = (
      await this.history.syncSlice(request.orgId, request.threadId, request.threadSeq, 1)
    ).serverMax;
    const deletions: ThreadLogDeletion[] = [
      { from: request.threadSeq, to: truncating ? 0 : request.threadSeq },
    ];
    this.threadEvents.emit(request.orgId, {
      type: 'log-changed',
      threadId: request.threadId,
      deletions,
      serverMax: cursor,
    });
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
    return truncating
      ? { kind: 'truncated', fromThreadSeq: request.threadSeq, summary, cursor }
      : { kind: 'removed', threadSeq: request.threadSeq, summary, cursor };
  }
}
