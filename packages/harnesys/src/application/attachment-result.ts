import type { ThreadAttachmentRecord } from '../ports/thread-attachments.ts';
import type { FileToolResult } from './tool-message.ts';

export function attachmentToolResultOf(record: ThreadAttachmentRecord): FileToolResult {
  return {
    ok: true,
    relPath: `thread:${record.path}`,
    attachmentId: record.attachmentId,
    name: record.name,
    mediaType: record.mediaType,
    kind: record.kind,
  };
}
