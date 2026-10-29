import { AUDIO_TYPES, IMAGE_TYPES, VIDEO_TYPES } from '../constants.ts';
import type { Attachment, SendFile } from '../domain/attachment.ts';

interface FoldResult {
  type: 'text' | 'image' | 'audio' | 'video';
  text?: string;
  data?: Uint8Array;
  mediaType?: string;
}
export type AttachmentReadFn = (uri: string) =>
  | Promise<{
      bytes: Uint8Array;
      mediaType?: string;
    }>
  | {
      bytes: Uint8Array;
      mediaType?: string;
    };
function classify(mediaType?: string): 'image' | 'audio' | 'video' | 'file' {
  if (!mediaType) {
    return 'file';
  }
  if (IMAGE_TYPES.includes(mediaType)) {
    return 'image';
  }
  if (AUDIO_TYPES.includes(mediaType)) {
    return 'audio';
  }
  if (VIDEO_TYPES.includes(mediaType)) {
    return 'video';
  }
  return 'file';
}
export const MAX_INLINE_BYTES = 1_000_000;

function displayName(file: SendFile): string {
  if ('path' in file && file.path) {
    return file.path;
  }
  if ('name' in file && file.name) {
    return file.name;
  }
  return 'attachment';
}

export async function foldAttachments(
  files: SendFile[],
  readFn: AttachmentReadFn,
): Promise<FoldResult[]> {
  const results: FoldResult[] = [];
  for (const file of files) {
    const mediaType = file.mediaType;
    const kind = classify(mediaType);
    if (kind === 'file') {
      results.push({ type: 'text', text: `[file: ${displayName(file)}]` });
      continue;
    }
    let bytes: Uint8Array;
    if ('bytes' in file) {
      bytes = file.bytes;
    } else if ('path' in file) {
      bytes = (await readFn(file.path)).bytes;
    } else {
      continue;
    }
    if (bytes.byteLength > MAX_INLINE_BYTES) {
      results.push({ type: 'text', text: `[file: ${displayName(file)}]` });
      continue;
    }
    results.push({ type: kind, data: bytes, mediaType });
  }
  return results;
}
export async function materializeMessageAttachments(
  messages: unknown[],
  readFn: AttachmentReadFn,
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') {
      out.push(raw);
      continue;
    }
    const msg = raw as Record<string, unknown>;
    const attachments = msg.attachments;
    if (msg.role !== 'user' || !Array.isArray(attachments) || attachments.length === 0) {
      out.push(raw);
      continue;
    }
    const files: SendFile[] = (attachments as Attachment[]).map((a) => ({
      path: a.path,
      name: a.name,
      mediaType: a.mediaType,
    }));
    const folded = await foldAttachments(files, readFn);
    const parts: Record<string, unknown>[] = [];
    const text = typeof msg.content === 'string' ? msg.content : '';
    if (text) {
      parts.push({ type: 'text', text });
    }
    for (const part of folded) {
      if (part.type === 'text') {
        if (part.text) {
          parts.push({ type: 'text', text: part.text });
        }
        continue;
      }
      if (!part.data) {
        continue;
      }
      parts.push({
        type: 'file',
        mediaType: part.mediaType || part.type,
        data: part.data,
      });
    }
    const next: Record<string, unknown> = {
      role: 'user',
      content: parts.length > 0 ? parts : '',
    };
    if (msg.origin !== undefined) {
      next.origin = msg.origin;
    }
    out.push(next);
  }
  return out;
}
