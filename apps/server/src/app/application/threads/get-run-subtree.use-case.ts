import { Injectable } from '@harnesys/brix';
import { THREAD_HISTORY_PAGE_MAX_BYTES, type ThreadSubtreeResponse } from '@harnesys/contracts';
import { RunLifecycleReaderPort } from '../../domain/thread/run-lifecycle-reader.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadHistoryPagePort } from '../../domain/thread/thread-history-page.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { projectThreadEvents } from './thread-events-projection.ts';

export interface GetRunSubtreeRequest {
  orgId: string;
  threadId: string;
  runId: string;
}

const ARRAY_OVERHEAD_BYTES = 2;

function mostRecentFitting(events: unknown[]): { events: unknown[]; truncated: boolean } {
  const sizes = events.map((event) => Buffer.byteLength(JSON.stringify(event)));
  const budget = THREAD_HISTORY_PAGE_MAX_BYTES - ARRAY_OVERHEAD_BYTES;
  let total = 0;
  let start = events.length;
  while (start > 0) {
    const index = start - 1;
    const next = total + (sizes[index] ?? 0) + (start < events.length ? 1 : 0);
    if (next > budget) {
      break;
    }
    total = next;
    start -= 1;
  }
  return { events: events.slice(start), truncated: start > 0 };
}

@Injectable()
export class GetRunSubtreeUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly runs: RunLifecycleReaderPort,
    private readonly history: ThreadHistoryPagePort,
  ) {}

  async execute(request: GetRunSubtreeRequest): Promise<ThreadSubtreeResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const runs = await this.runs.listByThread(request.orgId, request.threadId);
    if (!runs.some((run) => run.runId === request.runId)) {
      throw new ThreadNotFoundException(`${request.threadId}:${request.runId}`);
    }
    const events = projectThreadEvents(
      await this.history.listRunSubtree(request.orgId, request.threadId, request.runId),
    );
    const fitted = mostRecentFitting(events);
    return fitted.truncated
      ? { events: fitted.events, outputTruncated: true }
      : { events: fitted.events };
  }
}
