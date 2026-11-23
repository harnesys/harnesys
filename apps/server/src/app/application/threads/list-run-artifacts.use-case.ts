import { Injectable } from '@harnesys/brix';
import type { ThreadArtifactsResponse } from '@harnesys/contracts';
import { extractRunArtifacts } from '@harnesys/studio-shared';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface ListRunArtifactsRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class ListRunArtifactsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly history: ThreadHistoryPagePort,
  ) {}

  async execute(request: ListRunArtifactsRequest): Promise<ThreadArtifactsResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const events = await this.history.listToolEvents(request.orgId, request.threadId);
    return { items: extractRunArtifacts(events) };
  }
}
