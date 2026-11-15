import { AddonError } from '@harnesys/sdk';
import type { OutgoingMediaKind } from './telegram-types.ts';

export type { OutgoingMediaKind };

export type RequestedMediaKind = OutgoingMediaKind | 'auto';
const KIND_EXTENSIONS: Record<OutgoingMediaKind, string> = {
  photo: 'jpg',
  video: 'mp4',
  document: 'bin',
  audio: 'mp3',
  voice: 'ogg',
  gif: 'gif',
};

const EXTENSION_KINDS: Record<string, OutgoingMediaKind> = {
  jpg: 'photo',
  jpeg: 'photo',
  png: 'photo',
  webp: 'photo',
  heic: 'photo',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  m4v: 'video',
  mkv: 'video',
  mp3: 'audio',
  m4a: 'audio',
  aac: 'audio',
  flac: 'audio',
  wav: 'audio',
  oga: 'audio',
  ogg: 'voice',
  opus: 'voice',
  gif: 'gif',
};

export const MEDIA_KINDS: readonly OutgoingMediaKind[] = [
  'photo',
  'video',
  'document',
  'audio',
  'voice',
  'gif',
];

export const REQUESTED_KINDS: readonly RequestedMediaKind[] = ['auto', ...MEDIA_KINDS];

const MIME_ALIASES: Record<string, OutgoingMediaKind> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/webp': 'photo',
  'image/heic': 'photo',
  'image/gif': 'gif',
  'audio/ogg': 'voice',
  'audio/opus': 'voice',
};

function extensionOf(name: string): string {
  return rawExtensionOf(name).toLowerCase();
}

function rawExtensionOf(name: string): string {
  const base = name.split(/[?#]/)[0] ?? name;
  const file = base.split(/[\\/]/).pop() ?? base;
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? '' : file.slice(dot + 1);
}

function baseNameOf(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  const dot = file.lastIndexOf('.');
  return dot <= 0 ? file : file.slice(0, dot);
}

export function kindOfName(name: string): OutgoingMediaKind | null {
  const extension = extensionOf(name);
  return extension.length === 0 ? null : (EXTENSION_KINDS[extension] ?? null);
}

export function kindOfMime(mimeType: string | null | undefined): OutgoingMediaKind | null {
  if (mimeType === null || mimeType === undefined) {
    return null;
  }
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  const alias = MIME_ALIASES[normalized];
  if (alias !== undefined) {
    return alias;
  }
  if (normalized.startsWith('image/')) {
    return 'photo';
  }
  if (normalized.startsWith('video/')) {
    return 'video';
  }
  if (normalized.startsWith('audio/')) {
    return 'audio';
  }
  return null;
}

export function resolveMediaKind(
  requested: RequestedMediaKind,
  name: string,
  mimeType?: string | null,
): OutgoingMediaKind {
  if (requested !== 'auto') {
    return requested;
  }
  return kindOfName(name) ?? kindOfMime(mimeType) ?? 'document';
}

export function defaultExtension(kind: OutgoingMediaKind): string {
  return KIND_EXTENSIONS[kind];
}

export function mediaFileName(name: string, kind: OutgoingMediaKind): string {
  const cleaned = baseNameOf(name)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 96);
  const safeBase = cleaned.length === 0 ? 'file' : cleaned;
  const existing = kindOfName(name);
  return existing === kind
    ? `${safeBase}.${rawExtensionOf(name)}`
    : `${safeBase}.${defaultExtension(kind)}`;
}

export function requestedKindOf(value: unknown): RequestedMediaKind {
  if (typeof value === 'string' && (REQUESTED_KINDS as readonly string[]).includes(value)) {
    return value as RequestedMediaKind;
  }
  throw new AddonError('invalid_params', {
    detail: `kind must be one of ${REQUESTED_KINDS.join(', ')}, got "${String(value)}"`,
  });
}
