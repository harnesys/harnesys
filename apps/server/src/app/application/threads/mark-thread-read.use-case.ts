import { Injectable } from '@harnesys/brix';
import type { ThreadPublic } from '@harnesys/contracts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { ThreadSummaryAssembler } from './thread-summary.assembler.ts';

export interface MarkThreadReadRequest {
  orgId: string;
  threadId: string;
  userId?: string;
}

@Injectable()
export class MarkThreadReadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly assembler: ThreadSummaryAssembler,
  ) {}

  async execute(request: MarkThreadReadRequest): Promise<ThreadPublic> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const read = this.threads.markRead(request.orgId, request.threadId, new Date().toISOString());
    if (thread.kind === 'group' && request.userId) {
      this.participants.touchSeen(
        request.orgId,
        thread.id,
        request.userId,
        new Date().toISOString(),
      );
    }
    const summary = await this.assembler.execute({
      orgId: request.orgId,
      thread: read,
      ...(request.userId === undefined ? {} : { userId: request.userId }),
    });
    return { ...summary, events: [], inheritedEventCount: 0 };
  }
}
