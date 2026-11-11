import { Inject, Injectable, Logger } from '@harnesys/brix';
import { RunConflictException } from '../../domain/thread/thread.error.ts';
import { requireRunAccepted } from '../threads/run-accepted.ts';
import { mechanicalRunStart } from '../threads/run-attribution.ts';
import { SendThreadRunUseCase } from '../threads/send-thread-run.use-case.ts';
import type { RunDispatchInput, RunDispatchResult } from './run-dispatch.port.ts';
import { RunDispatchPort } from './run-dispatch.port.ts';

@Injectable()
export class ThreadRunDispatchService extends RunDispatchPort {
  private readonly logger: Logger;

  constructor(
    private readonly sendThreadRun: SendThreadRunUseCase,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('addon-run-dispatch');
  }

  async dispatch(input: RunDispatchInput): Promise<RunDispatchResult> {
    const triggerId = input.runKey ?? input.correlationId ?? input.threadId;
    try {
      const accepted = requireRunAccepted(
        await this.sendThreadRun.execute({
          orgId: input.orgId,
          threadId: input.threadId,
          body: {
            text: input.text,
            correlationId: input.runKey ?? input.correlationId,
            ...(input.attachmentIds !== undefined && input.attachmentIds.length > 0
              ? { attachmentIds: input.attachmentIds }
              : {}),
          },
          attribution: mechanicalRunStart(null),
          trigger: { kind: 'connector', id: triggerId },
          expiresAt: null,
        }),
      );
      return { outcome: 'fired', runId: accepted.runId };
    } catch (error) {
      if (error instanceof RunConflictException) {
        return { outcome: 'busy', runId: null };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { orgId: input.orgId, threadId: input.threadId, triggerId, error: message },
        'addon run dispatch failed',
      );
      return { outcome: 'failed', runId: null };
    }
  }
}
