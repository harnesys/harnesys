import { Injectable } from '@harnesys/brix';
import type { ThreadSummary } from '@harnesys/contracts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface GetThreadSummaryRequest {
  orgId: string;
  threadId: string;
  userId?: string;
}

@Injectable()
export class GetThreadSummaryUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
    private readonly assembler: ThreadSummaryAssembler,
  ) {}

  async execute(request: GetThreadSummaryRequest): Promise<ThreadSummary> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const waitingForProfileId = await this.history.waitingForProfileId(
      request.orgId,
      request.threadId,
    );
    return this.assembler.execute({
      orgId: request.orgId,
      thread,
      waitingForProfileId,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
    });
  }
}
