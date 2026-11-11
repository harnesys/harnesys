import { type AddonContext, AddonError } from '@harnesys/sdk';
import { call, callMultipart } from './bot-api.ts';

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;

export interface TelegramMessageRef {
  message_id: number;
}

interface SendTarget {
  chat: string;
  topicId?: string;
  replyTo?: string;
  caption?: string;
}

interface FileSource {
  url?: string;
  path?: string;
  dataBase64?: string;
  name?: string;
  mimeType?: string;
}

function topicField(topicId: string | undefined): Record<string, unknown> {
  if (topicId === undefined || topicId.length === 0) {
    return {};
  }
  return { message_thread_id: Number(topicId) };
}

function targetFields(target: SendTarget): Record<string, unknown> {
  return {
    chat_id: target.chat,
    ...topicField(target.topicId),
    ...(target.replyTo !== undefined ? { reply_to_message_id: Number(target.replyTo) } : {}),
  };
}

async function bytesOfPath(ctx: AddonContext, path: string): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let offset = 0;
  let eof = false;
  while (!eof) {
    const chunk = await ctx.files.read({ path, offset, length: READ_CHUNK_BYTES });
    parts.push(new Uint8Array(Buffer.from(chunk.data, 'base64')));
    offset += chunk.size;
    eof = chunk.eof;
    if (offset > MAX_MEDIA_BYTES) {
      throw new AddonError('invalid_params', {
        detail: `file ${path} is larger than ${MAX_MEDIA_BYTES} bytes`,
      });
    }
  }
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    merged.set(part, cursor);
    cursor += part.length;
  }
  return merged;
}

export async function resolveBytes(
  ctx: AddonContext,
  source: FileSource,
): Promise<Uint8Array | null> {
  if (source.dataBase64 !== undefined) {
    return new Uint8Array(Buffer.from(source.dataBase64, 'base64'));
  }
  if (source.path !== undefined) {
    return bytesOfPath(ctx, source.path);
  }
  return null;
}

function sendUrlMedia(
  ctx: AddonContext,
  target: SendTarget,
  source: FileSource,
): Promise<TelegramMessageRef> {
  if (source.url === undefined) {
    throw new AddonError('invalid_params', {
      detail: 'exactly one of url, path or dataBase64 is required',
    });
  }
  const photo = source.mimeType?.startsWith('image/') === true;
  return call<TelegramMessageRef>(ctx, photo ? 'sendPhoto' : 'sendDocument', {
    ...targetFields(target),
    [photo ? 'photo' : 'document']: source.url,
    ...(target.caption !== undefined ? { caption: target.caption } : {}),
  });
}

function sendBytesMedia(
  ctx: AddonContext,
  target: SendTarget,
  source: FileSource,
  bytes: Uint8Array,
): Promise<TelegramMessageRef> {
  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `file is larger than ${MAX_MEDIA_BYTES} bytes`,
    });
  }
  const name = source.name ?? 'file';
  const mimeType = source.mimeType ?? 'application/octet-stream';
  const photo = mimeType.startsWith('image/');
  const fields: Record<string, string> = { chat_id: target.chat };
  if (target.topicId !== undefined) {
    fields.message_thread_id = target.topicId;
  }
  if (target.replyTo !== undefined) {
    fields.reply_to_message_id = target.replyTo;
  }
  if (target.caption !== undefined) {
    fields.caption = target.caption;
  }
  return callMultipart<TelegramMessageRef>(ctx, photo ? 'sendPhoto' : 'sendDocument', fields, {
    field: photo ? 'photo' : 'document',
    name,
    mimeType,
    bytes,
  });
}

export async function sendMedia(
  ctx: AddonContext,
  target: SendTarget,
  source: FileSource,
): Promise<TelegramMessageRef> {
  const bytes = await resolveBytes(ctx, source);
  return bytes === null
    ? sendUrlMedia(ctx, target, source)
    : sendBytesMedia(ctx, target, source, bytes);
}

export async function sendAlbum(
  ctx: AddonContext,
  target: SendTarget,
  urls: string[],
): Promise<TelegramMessageRef[]> {
  if (urls.length < 2 || urls.length > 10) {
    throw new AddonError('invalid_params', { detail: 'an album needs 2 to 10 items' });
  }
  const media = urls.map((url, index) => ({
    type: 'photo',
    media: url,
    ...(index === 0 && target.caption !== undefined ? { caption: target.caption } : {}),
  }));
  return call<TelegramMessageRef[]>(ctx, 'sendMediaGroup', {
    ...targetFields(target),
    media,
  });
}
