import { Injectable } from '@harnesys/brix';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

@Injectable()
export class ListThreadAttachmentsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
  ) {}

  execute(orgId: string, threadId: string): AttachmentRecord[] {
    if (!this.threads.findById(orgId, threadId)) {
      throw new ThreadNotFoundException(threadId);
    }
    return this.attachments.listByThread(orgId, threadId);
  }
}
