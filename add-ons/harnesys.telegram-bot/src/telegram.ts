import type { AddonContext, InboundAttachment } from '@harnesys/sdk';
import { call, downloadFile } from './bot-api.ts';

const DEFAULT_MEDIA_LIMIT_MB = 5;
const MAX_MEDIA_LIMIT_MB = 8;
const MAX_ATTACHMENTS = 10;

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

export interface TelegramFileRef {
  file_id: string;
  file_size?: number;
  mime_type?: string;
  file_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: TelegramChat;
  message_thread_id?: number;
  media_group_id?: string;
  from?: { id: number; is_bot?: boolean; username?: string; first_name?: string };
  photo?: Array<{ file_id: string; file_size?: number }>;
  document?: TelegramFileRef;
  audio?: TelegramFileRef;
  voice?: TelegramFileRef;
  video?: TelegramFileRef;
}

export interface TelegramChatMemberUpdate {
  chat: TelegramChat;
  from?: { id: number };
  new_chat_member?: { status?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  my_chat_member?: TelegramChatMemberUpdate;
}

export function channelOf(message: TelegramMessage): string {
  const chat = String(message.chat.id);
  return message.message_thread_id === undefined ? chat : `${chat}:${message.message_thread_id}`;
}

export function firstText(messages: TelegramMessage[]): string {
  for (const message of messages) {
    const value = message.text ?? message.caption ?? '';
    if (value.length > 0) {
      return value;
    }
  }
  return '';
}

export function fileRefOf(message: TelegramMessage): (TelegramFileRef & { photo: boolean }) | null {
  if (message.document !== undefined) {
    return { ...message.document, photo: false };
  }
  if (message.video !== undefined) {
    return { ...message.video, photo: false };
  }
  if (message.audio !== undefined) {
    return { ...message.audio, photo: false };
  }
  if (message.voice !== undefined) {
    return { ...message.voice, photo: false };
  }
  const photos = message.photo ?? [];
  const largest = photos.reduce<{ file_id: string; file_size?: number } | null>(
    (best, entry) =>
      best === null || (entry.file_size ?? 0) > (best.file_size ?? 0) ? entry : best,
    null,
  );
  return largest === null
    ? null
    : { file_id: largest.file_id, file_size: largest.file_size, photo: true };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

export function mimeOf(ref: TelegramFileRef | null, filePath: string | undefined): string {
  if (ref !== null && typeof ref.mime_type === 'string' && ref.mime_type.length > 0) {
    return ref.mime_type;
  }
  const extension = filePath?.split('.').pop()?.toLowerCase() ?? '';
  const fromExtension = MIME_BY_EXTENSION[extension];
  if (fromExtension !== undefined) {
    return fromExtension;
  }
  return 'application/octet-stream';
}

async function mediaLimitMb(ctx: AddonContext): Promise<number> {
  const config = await ctx.config.get(['media_limit_mb']);
  const value = config.media_limit_mb;
  return typeof value === 'number' && value > 0
    ? Math.min(value, MAX_MEDIA_LIMIT_MB)
    : DEFAULT_MEDIA_LIMIT_MB;
}

export async function inboundAttachments(
  ctx: AddonContext,
  messages: TelegramMessage[],
): Promise<InboundAttachment[]> {
  const limit = (await mediaLimitMb(ctx)) * 1024 * 1024;
  const attachments: InboundAttachment[] = [];
  for (const message of messages) {
    if (attachments.length >= MAX_ATTACHMENTS) {
      break;
    }
    const ref = fileRefOf(message);
    if (ref === null) {
      continue;
    }
    if ((ref.file_size ?? 0) > limit) {
      await ctx.log.warn('inbound attachment skipped: over the media limit', {
        chatId: message.chat.id,
        messageId: message.message_id,
        size: ref.file_size ?? 0,
      });
      continue;
    }
    const file = await call<{ file_path?: string }>(ctx, 'getFile', { file_id: ref.file_id });
    if (file.file_path === undefined) {
      continue;
    }
    const dataBase64 = await downloadFile(ctx, file.file_path);
    const fallbackName = ref.photo
      ? `photo-${message.message_id}.jpg`
      : `telegram-${message.message_id}`;
    attachments.push({
      name: ref.file_name ?? fallbackName,
      mediaType: mimeOf(ref, file.file_path),
      dataBase64,
    });
  }
  return attachments;
}

export function groupMessages(messages: TelegramMessage[]): TelegramMessage[][] {
  const groups: TelegramMessage[][] = [];
  const byGroupId = new Map<string, TelegramMessage[]>();
  for (const message of messages) {
    const groupId = message.media_group_id;
    if (groupId === undefined) {
      groups.push([message]);
      continue;
    }
    const existing = byGroupId.get(groupId);
    if (existing === undefined) {
      const created = [message];
      byGroupId.set(groupId, created);
      groups.push(created);
      continue;
    }
    existing.push(message);
  }
  return groups;
}
