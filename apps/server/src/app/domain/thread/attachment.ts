export type AttachmentKind = 'image' | 'audio' | 'video' | 'file';

export interface AttachmentRecord {
  id: string;
  threadId: string;
  name: string;
  mediaType: string;
  kind: AttachmentKind;
  sizeBytes: number;
  path: string | null;
  createdAt: string;
}

export type AttachmentInsert = Omit<AttachmentRecord, 'path'> & { path?: string | null };

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const UNSAFE_FILE_NAME = /[^\w.\- ()[\]]/g;

export function kindFromMediaType(mediaType: string): AttachmentKind {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType.startsWith('audio/')) {
    return 'audio';
  }
  if (mediaType.startsWith('video/')) {
    return 'video';
  }
  return 'file';
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(UNSAFE_FILE_NAME, '_').replace(/^\.+/, '');
  if (!cleaned || cleaned === '_') {
    return 'file';
  }
  return cleaned;
}

export function attachmentRelPath(id: string, fileName: string): string {
  return `attachments/${id}/${fileName}`;
}
