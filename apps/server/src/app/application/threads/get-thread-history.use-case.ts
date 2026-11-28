import { Injectable } from '@harnesys/brix';
import {
  THREAD_HISTORY_PAGE_RUNS,
  THREAD_HISTORY_RANGE_MAX_EVENTS,
  type ThreadHistoryPage,
  type ThreadSummary,
} from '@harnesys/contracts';
import type { SessionEvent } from 'harnesys';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { ThreadHistorySlice } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { projectThreadEvents } from './thread-events-projection.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface GetThreadHistoryRequest {
  orgId: string;
  threadId: string;
  beforeThreadSeq?: number;
  fromThreadSeq?: number;
  toThreadSeq?: number;
  aroundThreadSeq?: number;
  limitRuns?: number;
  userId?: string;
}

function boundsOf(events: SessionEvent[]): { minThreadSeq: number; maxThreadSeq: number } {
  if (events.length === 0) {
    return { minThreadSeq: 0, maxThreadSeq: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const event of events) {
    const seq = event.threadSeq ?? 0;
    min = Math.min(min, seq);
    max = Math.max(max, seq);
  }
  return { minThreadSeq: min, maxThreadSeq: max };
}

@Injectable()
export class GetThreadHistoryUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
    private readonly assembler: ThreadSummaryAssembler,
  ) {}

  async execute(request: GetThreadHistoryRequest): Promise<ThreadHistoryPage> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (request.aroundThreadSeq !== undefined) {
      return this.aroundPage(thread, request, request.aroundThreadSeq);
    }
    if (request.fromThreadSeq !== undefined && request.toThreadSeq !== undefined) {
      const range = await this.history.listRange(
        request.orgId,
        request.threadId,
        request.fromThreadSeq,
        request.toThreadSeq,
      );
      if (!range.complete) {
        return this.tailPage(thread, request, 'tail');
      }
      return this.rangePage(thread, request, range);
    }
    const kind = request.beforeThreadSeq === undefined ? 'tail' : 'before';
    return this.tailPage(thread, request, kind);
  }

  private async tailPage(
    thread: ThreadRecord,
    request: GetThreadHistoryRequest,
    kind: 'tail' | 'before',
  ): Promise<ThreadHistoryPage> {
    const slice = await this.history.listPage(request.orgId, thread.id, {
      ...(request.beforeThreadSeq === undefined
        ? {}
        : { beforeThreadSeq: request.beforeThreadSeq }),
      limitRuns: request.limitRuns ?? THREAD_HISTORY_PAGE_RUNS,
    });
    const summary = await this.summaryOf(thread, request, slice.waitingForProfileId);
    return {
      kind,
      summary,
      events: projectThreadEvents(slice.events),
      minThreadSeq: slice.minThreadSeq,
      maxThreadSeq: slice.maxThreadSeq,
      hasMoreBefore: slice.hasMoreBefore,
      hasMoreAfter: false,
      hiddenRunsBefore: slice.hiddenRunsBefore,
      firstUserThreadSeq: slice.firstUserThreadSeq,
    };
  }

  private async aroundPage(
    thread: ThreadRecord,
    request: GetThreadHistoryRequest,
    aroundThreadSeq: number,
  ): Promise<ThreadHistoryPage> {
    const slice = await this.history.listAround(request.orgId, thread.id, aroundThreadSeq);
    const summary = await this.summaryOf(thread, request, slice.waitingForProfileId);
    return {
      kind: 'tail',
      summary,
      events: projectThreadEvents(slice.events),
      minThreadSeq: slice.minThreadSeq,
      maxThreadSeq: slice.maxThreadSeq,
      hasMoreBefore: slice.hasMoreBefore,
      hasMoreAfter: slice.hasMoreAfter,
      hiddenRunsBefore: slice.hiddenRunsBefore,
      firstUserThreadSeq: slice.firstUserThreadSeq,
    };
  }

  private async rangePage(
    thread: ThreadRecord,
    request: GetThreadHistoryRequest,
    range: ThreadHistorySlice,
  ): Promise<ThreadHistoryPage> {
    const rows =
      range.events.length > THREAD_HISTORY_RANGE_MAX_EVENTS
        ? range.events.slice(0, THREAD_HISTORY_RANGE_MAX_EVENTS)
        : range.events;
    const bounds = boundsOf(rows);
    const summary = await this.summaryOf(thread, request, range.waitingForProfileId);
    return {
      kind: 'range',
      summary,
      events: projectThreadEvents(rows),
      minThreadSeq: bounds.minThreadSeq,
      maxThreadSeq: bounds.maxThreadSeq,
      hasMoreBefore: false,
      hasMoreAfter: range.hasMoreAfter,
      hiddenRunsBefore: null,
      firstUserThreadSeq: range.firstUserThreadSeq,
    };
  }

  private summaryOf(
    thread: ThreadRecord,
    request: GetThreadHistoryRequest,
    waitingForProfileId: string | undefined,
  ): Promise<ThreadSummary> {
    return this.assembler.execute({
      orgId: request.orgId,
      thread,
      waitingForProfileId,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
    });
  }
}
