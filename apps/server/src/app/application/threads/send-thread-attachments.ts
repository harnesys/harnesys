import type { Attachment, AttachmentKind } from 'harnesys';
import type { AttachmentRepositoryPort } from '../../domain/thread/attachment-repository.port.ts';
import {
  RunConflictException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';

export interface AttachmentMeta {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  kind: AttachmentKind;
}

export function attachmentMetasOf(
  attachments: AttachmentRepositoryPort,
  orgId: string,
  threadId: string,
  ids: string[] | undefined,
): AttachmentMeta[] {
  if (!ids?.length) {
    return [];
  }
  const out: AttachmentMeta[] = [];
  for (const id of ids) {
    const row = attachments.findById(orgId, id);
    if (!row || row.threadId !== threadId || !row.path) {
      throw new ThreadValidationException(`attachment not found: ${id}`);
    }
    out.push({
      id: row.id,
      name: row.name,
      mediaType: row.mediaType,
      sizeBytes: row.sizeBytes,
      kind: row.kind,
    });
  }
  return out;
}

export function resolveAttachmentsOf(
  attachments: AttachmentRepositoryPort,
  orgId: string,
  threadId: string,
  ids: string[] | undefined,
): Attachment[] {
  if (!ids?.length) {
    return [];
  }
  const out: Attachment[] = [];
  for (const id of ids) {
    const row = attachments.findById(orgId, id);
    if (!row || row.threadId !== threadId || !row.path) {
      throw new ThreadValidationException(`attachment not found: ${id}`);
    }
    out.push({
      id: row.id,
      kind: row.kind,
      name: row.name,
      mediaType: row.mediaType,
      path: row.path,
    });
  }
  return out;
}

export function mapSendError(error: unknown): Error {
  const code = (error as { code?: string }).code;
  if (code === 'pending_ask') {
    return new RunConflictException('thread waits for input', {
      pendingAskId: (error as { interruptId?: string }).interruptId,
    });
  }
  if (code === 'thread_busy') {
    return new RunConflictException('thread already has an active run');
  }
  return error instanceof Error ? error : new Error(String(error));
}
