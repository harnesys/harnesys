import { type AddonContext, AddonError } from '@harnesys/sdk';
import { type CallOptions, call, callMultipart, type MultipartFile } from './bot-api.ts';

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const READ_CHUNK_BYTES = 1024 * 1024;
const MIN_ALBUM_ITEMS = 2;
const MAX_ALBUM_ITEMS = 10;
const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mkv']);
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  pdf: 'application/pdf',
  txt: 'text/plain',
  json: 'application/json',
  csv: 'text/csv',
  zip: 'application/zip',
};

export type MediaKind = 'photo' | 'video' | 'document';

export interface MediaTarget {
  chat: string;
  topicId?: string;
  replyTo?: number;
  caption?: string;
  parseMode?: string;
  disableNotification?: boolean;
}

export interface FileSource {
  url?: string;
  path?: string;
  dataBase64?: string;
  name?: string;
  mimeType?: string;
  kind?: MediaKind;
}

export interface TelegramMessage {
  message_id: number;
  photo?: Array<{ file_id: string }>;
  document?: { file_id: string };
  video?: { file_id: string };
  audio?: { file_id: string };
  voice?: { file_id: string };
  animation?: { file_id: string };
}

export function fileIdOf(message: TelegramMessage): string | undefined {
  if (message.photo !== undefined && message.photo.length > 0) {
    return message.photo[message.photo.length - 1]?.file_id;
  }
  return (
    message.document?.file_id ??
    message.video?.file_id ??
    message.audio?.file_id ??
    message.voice?.file_id ??
    message.animation?.file_id
  );
}

function extensionOf(source: FileSource): string | undefined {
  const candidate = source.name ?? source.path ?? source.url;
  if (candidate === undefined) {
    return undefined;
  }
  const withoutQuery = candidate.split('?')[0] ?? candidate;
  const dot = withoutQuery.lastIndexOf('.');
  return dot < 0 ? undefined : withoutQuery.slice(dot + 1).toLowerCase();
}

export function kindOf(source: FileSource): MediaKind {
  if (source.kind !== undefined) {
    return source.kind;
  }
  if (source.mimeType?.startsWith('image/') === true) {
    return 'photo';
  }
  if (source.mimeType?.startsWith('video/') === true) {
    return 'video';
  }
  const extension = extensionOf(source);
  if (extension !== undefined && PHOTO_EXTENSIONS.has(extension)) {
    return 'photo';
  }
  if (extension !== undefined && VIDEO_EXTENSIONS.has(extension)) {
    return 'video';
  }
  return 'document';
}

function mimeTypeOf(source: FileSource, kind: MediaKind): string {
  if (source.mimeType !== undefined) {
    return source.mimeType;
  }
  const extension = extensionOf(source);
  const known = extension === undefined ? undefined : MIME_BY_EXTENSION[extension];
  if (known !== undefined) {
    return known;
  }
  if (kind === 'photo') {
    return 'image/jpeg';
  }
  if (kind === 'video') {
    return 'video/mp4';
  }
  return 'application/octet-stream';
}

function fileNameOf(source: FileSource, kind: MediaKind): string {
  if (source.name !== undefined) {
    return source.name;
  }
  if (source.path !== undefined) {
    const base = source.path.split('/').pop();
    if (base !== undefined && base.length > 0) {
      return base;
    }
  }
  if (kind === 'photo') {
    return 'photo.jpg';
  }
  return kind === 'video' ? 'video.mp4' : 'file';
}

function methodOf(kind: MediaKind): string {
  if (kind === 'photo') {
    return 'sendPhoto';
  }
  return kind === 'video' ? 'sendVideo' : 'sendDocument';
}

function fieldOf(kind: MediaKind): string {
  if (kind === 'photo') {
    return 'photo';
  }
  return kind === 'video' ? 'video' : 'document';
}

function targetFields(target: MediaTarget): Record<string, unknown> {
  return {
    chat_id: target.chat,
    ...(target.topicId === undefined ? {} : { message_thread_id: Number(target.topicId) }),
    ...(target.replyTo === undefined ? {} : { reply_to_message_id: target.replyTo }),
    ...(target.caption === undefined ? {} : { caption: target.caption }),
    ...(target.parseMode === undefined ? {} : { parse_mode: target.parseMode }),
    ...(target.disableNotification === true ? { disable_notification: true } : {}),
  };
}

function targetFormFields(target: MediaTarget): Record<string, string> {
  return {
    chat_id: target.chat,
    ...(target.topicId === undefined ? {} : { message_thread_id: target.topicId }),
    ...(target.replyTo === undefined ? {} : { reply_to_message_id: String(target.replyTo) }),
    ...(target.caption === undefined ? {} : { caption: target.caption }),
    ...(target.parseMode === undefined ? {} : { parse_mode: target.parseMode }),
    ...(target.disableNotification === true ? { disable_notification: 'true' } : {}),
  };
}

function bytesTooLarge(detail: string): AddonError {
  return new AddonError('invalid_params', {
    detail: `${detail} is larger than ${MAX_MEDIA_BYTES} bytes; send a smaller file or pass a public url`,
  });
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
      throw bytesTooLarge(`file ${path}`);
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

export async function sendMedia(
  ctx: AddonContext,
  target: MediaTarget,
  source: FileSource,
  options: CallOptions,
): Promise<TelegramMessage> {
  const bytes = await resolveBytes(ctx, source);
  const kind = kindOf(source);
  if (bytes === null) {
    if (source.url === undefined) {
      throw new AddonError('invalid_params', {
        detail: 'one of url, path or dataBase64 is required',
      });
    }
    return call<TelegramMessage>(
      ctx,
      methodOf(kind),
      {
        ...targetFields(target),
        [fieldOf(kind)]: source.url,
      },
      options,
    );
  }
  const file: MultipartFile = {
    field: fieldOf(kind),
    name: fileNameOf(source, kind),
    mimeType: mimeTypeOf(source, kind),
    bytes,
  };
  return callMultipart<TelegramMessage>(
    ctx,
    methodOf(kind),
    { fields: targetFormFields(target), files: [file] },
    options,
  );
}

interface AlbumPart {
  media: Record<string, unknown>;
  file?: MultipartFile;
}

function albumCaptionFields(target: MediaTarget, index: number): Record<string, unknown> {
  if (index > 0) {
    return {};
  }
  return {
    ...(target.caption === undefined ? {} : { caption: target.caption }),
    ...(target.parseMode === undefined ? {} : { parse_mode: target.parseMode }),
  };
}

async function albumPart(
  ctx: AddonContext,
  target: MediaTarget,
  source: FileSource,
  index: number,
): Promise<AlbumPart> {
  const kind = kindOf(source);
  const captionFields = albumCaptionFields(target, index);
  const bytes = await resolveBytes(ctx, source);
  if (bytes === null) {
    if (source.url === undefined) {
      throw new AddonError('invalid_params', {
        detail: 'each album item needs one of url, path or dataBase64',
      });
    }
    return { media: { type: kind, media: source.url, ...captionFields } };
  }
  const field = `file${index}`;
  return {
    media: { type: kind, media: `attach://${field}`, ...captionFields },
    file: {
      field,
      name: fileNameOf(source, kind),
      mimeType: mimeTypeOf(source, kind),
      bytes,
    },
  };
}

export async function sendAlbum(
  ctx: AddonContext,
  target: MediaTarget,
  sources: FileSource[],
  options: CallOptions,
): Promise<TelegramMessage[]> {
  if (sources.length < MIN_ALBUM_ITEMS || sources.length > MAX_ALBUM_ITEMS) {
    throw new AddonError('invalid_params', {
      detail: `an album needs ${MIN_ALBUM_ITEMS} to ${MAX_ALBUM_ITEMS} items`,
    });
  }
  const media: Array<Record<string, unknown>> = [];
  const files: MultipartFile[] = [];
  for (const [index, source] of sources.entries()) {
    const part = await albumPart(ctx, target, source, index);
    media.push(part.media);
    if (part.file !== undefined) {
      files.push(part.file);
    }
  }
  const fields: Record<string, string> = {
    chat_id: target.chat,
    media: JSON.stringify(media),
    ...(target.topicId === undefined ? {} : { message_thread_id: target.topicId }),
    ...(target.disableNotification === true ? { disable_notification: 'true' } : {}),
  };
  if (files.length === 0) {
    return call<TelegramMessage[]>(
      ctx,
      'sendMediaGroup',
      {
        chat_id: target.chat,
        media,
        ...(target.topicId === undefined ? {} : { message_thread_id: Number(target.topicId) }),
        ...(target.disableNotification === true ? { disable_notification: true } : {}),
      },
      options,
    );
  }
  return callMultipart<TelegramMessage[]>(ctx, 'sendMediaGroup', { fields, files }, options);
}
