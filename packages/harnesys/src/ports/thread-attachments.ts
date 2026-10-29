import type { AttachmentKind } from '../domain/attachment.ts';
import type { CapabilityScope } from '../domain/pack.ts';

export interface ThreadAttachmentPutInput {
  name: string;
  bytes: Uint8Array;
  mediaType?: string;
}

export interface ThreadAttachmentRecord {
  attachmentId: string;
  name: string;
  mediaType: string;
  kind: AttachmentKind;

  path: string;
}

export abstract class ThreadAttachmentPort {
  abstract put(
    scope: CapabilityScope,
    input: ThreadAttachmentPutInput,
  ): Promise<ThreadAttachmentRecord>;
}
