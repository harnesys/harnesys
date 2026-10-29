import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';

export interface ReadThreadAttachmentRequest {
  orgId: string;
  threadId: string;
  attachmentId: string;
}

export interface ThreadAttachmentPayload {
  meta: AttachmentRecord;
  fileName: string;
  bytes: Uint8Array;
}

@Injectable()
export class GetThreadAttachmentUseCase {
  constructor(
    private readonly attachments: AttachmentRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: ReadThreadAttachmentRequest): Promise<ThreadAttachmentPayload> {
    const meta = this.attachments.findById(request.orgId, request.attachmentId);
    if (!meta || meta.threadId !== request.threadId || !meta.path) {
      throw new ThreadValidationException(`attachment not found: ${request.attachmentId}`);
    }
    const bytes = await this.storage.read(
      this.layout.threadDir(request.orgId, request.threadId),
      meta.path,
    );
    if (!bytes) {
      throw new ThreadValidationException(`attachment file missing: ${request.attachmentId}`);
    }
    return { meta, fileName: meta.name, bytes };
  }
}
