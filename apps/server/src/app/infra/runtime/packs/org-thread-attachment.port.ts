import type { CapabilityScope, ThreadAttachmentPutInput, ThreadAttachmentRecord } from 'harnesys';
import { ThreadAttachmentPort } from 'harnesys';
import { UploadThreadAttachmentUseCase } from '../../../application/threads/upload-thread-attachment.use-case.ts';
import type { HostFsLayoutPort } from '../../../domain/machine/host-fs-layout.port.ts';
import type { ThreadRepositoryPort } from '../../../domain/thread/thread-repository.port.ts';
import { AttachmentRepositoryAdapter } from '../../thread/attachment-repository.adapter.ts';
import { AttachmentStorageAdapter } from '../../thread/attachment-storage.adapter.ts';

export interface OrgThreadAttachmentPortDeps {
  threads: ThreadRepositoryPort;
  layout: HostFsLayoutPort;
}

export class OrgThreadAttachmentPort extends ThreadAttachmentPort {
  private readonly useCase: UploadThreadAttachmentUseCase;

  constructor(deps: OrgThreadAttachmentPortDeps) {
    super();
    this.useCase = new UploadThreadAttachmentUseCase(
      deps.threads,
      new AttachmentRepositoryAdapter(deps.layout),
      new AttachmentStorageAdapter(),
      deps.layout,
    );
  }

  async put(
    scope: CapabilityScope,
    input: ThreadAttachmentPutInput,
  ): Promise<ThreadAttachmentRecord> {
    const record = await this.useCase.execute({
      orgId: scope.orgId,
      threadId: scope.threadId,
      name: input.name,
      mediaType: input.mediaType ?? 'application/octet-stream',
      bytes: input.bytes,
    });
    if (record.path === null) {
      throw new Error(`attachment ${record.id} has no storage path`);
    }
    return {
      attachmentId: record.id,
      name: record.name,
      mediaType: record.mediaType,
      kind: record.kind,
      path: record.path,
    };
  }
}
