import path from 'node:path';
import type { ThreadAttachmentRecord } from '../ports/thread-attachments.ts';
import type { FileToolResult } from './tool-message.ts';

export function attachmentToolResultOf(
  record: ThreadAttachmentRecord,
  roots: { threadDir?: string; runRoot?: string } = {},
): FileToolResult {
  const anchor = roots.threadDir ?? roots.runRoot;
  const absolute = anchor ? path.resolve(anchor, record.path) : path.resolve(record.path);
  return {
    ok: true,
    path: absolute,
    attachmentId: record.attachmentId,
    name: record.name,
    mediaType: record.mediaType,
    kind: record.kind,
    sizeBytes: record.sizeBytes,
  };
}
