import type { AttachmentInsert, AttachmentRecord } from './attachment.ts';

export abstract class AttachmentRepositoryPort {
  abstract listByThread(orgId: string, threadId: string): AttachmentRecord[];
  abstract findById(orgId: string, id: string): AttachmentRecord | undefined;
  abstract insert(orgId: string, rec: AttachmentInsert): AttachmentRecord;
  abstract removeByThread(orgId: string, threadId: string): void;
}
