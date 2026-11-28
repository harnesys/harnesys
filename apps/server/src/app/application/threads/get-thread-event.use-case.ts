import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface GetThreadEventRequest {
  orgId: string;
  threadId: string;
  threadSeq: number;
}

export interface GetThreadEventResponse {
  event: SessionEvent;
}

@Injectable()
export class GetThreadEventUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
  ) {}

  async execute(request: GetThreadEventRequest): Promise<GetThreadEventResponse> {
    if (!this.threads.findById(request.orgId, request.threadId)) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const slice = await this.history.syncSlice(
      request.orgId,
      request.threadId,
      request.threadSeq - 1,
      1,
    );
    const event = slice.rows.find((row) => row.threadSeq === request.threadSeq);
    if (!event) {
      throw new ThreadNotFoundException(request.threadId);
    }
    return { event };
  }
}
