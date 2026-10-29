import { Injectable } from '@harnesys/brix';
import type { SessionEvent } from 'harnesys';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { RunNotFoundException, ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface StreamRunEventsRequest {
  orgId: string;
  threadId: string;
  runId: string;
  fromSeq?: number;
}

@Injectable()
export class StreamRunEventsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: StreamRunEventsRequest): Promise<AsyncIterable<SessionEvent>> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const rec = await lifecycle.get(request.runId);
    if (rec && rec.threadId !== request.threadId) {
      throw new RunNotFoundException(request.runId);
    }
    return this.executor.stream(request.orgId, request.runId, request.fromSeq);
  }
}
