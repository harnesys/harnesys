import { Injectable } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import type { AttachmentRecord } from '../../domain/thread/attachment.ts';
import {
  kindFromMediaType,
  MAX_ATTACHMENT_BYTES,
  sanitizeFileName,
} from '../../domain/thread/attachment.ts';
import { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import { AttachmentStoragePort } from '../../domain/thread/attachment-storage.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export interface UploadThreadAttachmentRequest {
  orgId: string;
  threadId: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

@Injectable()
export class UploadThreadAttachmentUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly attachments: AttachmentRepositoryPort,
    private readonly storage: AttachmentStoragePort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: UploadThreadAttachmentRequest): Promise<AttachmentRecord> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    if (request.bytes.byteLength === 0) {
      throw new ThreadValidationException('attachment is empty');
    }
    if (request.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new ThreadValidationException('attachment exceeds the size limit');
    }
    const id = crypto.randomUUID();
    const fileName = sanitizeFileName(request.name);
    const threadDir = this.layout.ensureThreadDir(request.orgId, request.threadId);
    const relPath = await this.storage.write(threadDir, id, fileName, request.bytes);
    return this.attachments.insert(request.orgId, {
      id,
      threadId: request.threadId,
      name: fileName,
      mediaType: request.mediaType,
      kind: kindFromMediaType(request.mediaType),
      sizeBytes: request.bytes.byteLength,
      path: relPath,
      createdAt: new Date().toISOString(),
    });
  }
}
