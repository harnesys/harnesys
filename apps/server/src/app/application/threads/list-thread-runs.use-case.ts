import { Injectable } from '@harnesys/brix';
import {
  RunLifecycleReaderPort,
  type RunListFilter,
  type RunSummaryRecord,
} from '../../domain/thread/run-lifecycle-reader.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface ListThreadRunsRequest {
  orgId: string;
  threadId: string;
  status?: string;
}

@Injectable()
export class ListThreadRunsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly runs: RunLifecycleReaderPort,
  ) {}

  async execute(request: ListThreadRunsRequest): Promise<RunSummaryRecord[]> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const filter: RunListFilter = { status: request.status };
    return this.runs.listByThread(request.orgId, request.threadId, filter);
  }
}
