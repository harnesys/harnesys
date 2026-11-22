import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
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
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: GetThreadEventRequest): Promise<GetThreadEventResponse> {
    if (!this.threads.findById(request.orgId, request.threadId)) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const events = await this.executor.events(request.orgId);
    const event = await events.eventAt(request.threadId, request.threadSeq);
    if (!event) {
      throw new ThreadNotFoundException(request.threadId);
    }
    return { event };
  }
}
