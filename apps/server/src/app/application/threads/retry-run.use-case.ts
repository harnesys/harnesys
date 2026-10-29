import { Injectable } from '@harnesys/brix';
import type { RetryRunResponse } from '@harnesys/contracts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  RunConflictException,
  RunNotFoundException,
  ThreadNotFoundException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface RetryRunRequest {
  orgId: string;
  threadId: string;
  runId: string;
}

@Injectable()
export class RetryRunUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: RetryRunRequest): Promise<RetryRunResponse> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const rec = await lifecycle.get(request.runId);
    if (!rec || rec.threadId !== request.threadId) {
      throw new RunNotFoundException(request.runId);
    }
    if (rec.status === 'needs_input') {
      throw new RunConflictException(`run has pending ask: ${request.runId}`, {
        runId: request.runId,
      });
    }
    try {
      return await this.executor.retry(request.orgId, request.runId);
    } catch (error) {
      throw mapRetryError(request.runId, error);
    }
  }
}

function mapRetryError(runId: string, error: unknown): Error {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'unknown_run') {
    return new RunNotFoundException(runId);
  }
  if (
    code === 'unknown_interrupt' ||
    code === 'already_resumed' ||
    code === 'run_terminal' ||
    code === 'lease_stale'
  ) {
    return new RunConflictException((error as Error).message, { runId });
  }
  return error instanceof Error ? error : new RunConflictException('retry failed', { runId });
}
