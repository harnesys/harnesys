import { AddonError, type AddonContext } from '@harnesys/sdk';
import { mediaFileName, resolveMediaKind } from './media-kind.ts';
import { type MediaSource, parseMediaSource } from './media-source.ts';
import type { MediaItemInput } from './tool-album.ts';
import type { MediaFile } from './telegram-types.ts';

export const HOST_HTTP_LIMIT_BYTES = 8 * 1024 * 1024;
const READ_CHUNK_BYTES = 4 * 1024 * 1024;
const WRITE_CHUNK_BYTES = 4 * 1024 * 1024;

function megabytes(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function tooLarge(bytes: number, limitBytes: number): AddonError {
  return new AddonError('invalid_params', {
    detail: `media is ${megabytes(bytes)} MB, above the ${megabytes(limitBytes)} MB cap; raise max_upload_mb or send a smaller file`,
  });
}

function base64Buffer(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

function concat(parts: readonly Uint8Array[], total: number): Buffer {
  const merged = Buffer.alloc(total);
  let cursor = 0;
  for (const part of parts) {
    merged.set(part, cursor);
    cursor += part.length;
  }
  return merged;
}

async function pathBytes(ctx: AddonContext, path: string, maxBytes: number): Promise<Buffer> {
  const stat = await ctx.files.stat(path);
  if (stat.size > maxBytes) {
    throw tooLarge(stat.size, maxBytes);
  }
  const parts: Uint8Array[] = [];
  let offset = 0;
  let eof = false;
  while (!eof) {
    const chunk = await ctx.files.read({ path, offset, length: READ_CHUNK_BYTES });
    parts.push(base64Buffer(chunk.data));
    offset += chunk.size;
    eof = chunk.eof;
    if (offset > maxBytes) {
      throw tooLarge(offset, maxBytes);
    }
  }
  return concat(parts, parts.reduce((sum, part) => sum + part.length, 0));
}

interface UrlBytes {
  data: Buffer;
  mimeType: string | null;
}

async function urlBytes(ctx: AddonContext, url: string, maxBytes: number): Promise<UrlBytes> {
  const limit = Math.min(maxBytes, HOST_HTTP_LIMIT_BYTES);
  const response = await ctx.http
    .fetch({ url, responseEncoding: 'base64' })
    .catch((error: unknown) => {
      throw new AddonError('unavailable', {
        detail: `could not download ${url}: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
  if (response.status < 200 || response.status >= 300) {
    throw new AddonError('invalid_params', {
      detail: `downloading ${url} returned HTTP ${response.status}`,
    });
  }
  const data = base64Buffer(response.bodyBase64 ?? '');
  if (data.length > limit) {
    throw tooLarge(data.length, limit);
  }
  const headers = response.headers;
  const mimeType =
    headers['content-type'] ?? headers['Content-Type'] ?? headers['CONTENT-TYPE'] ?? null;
  return { data, mimeType };
}

export async function loadMediaFile(
  ctx: AddonContext,
  item: MediaItemInput,
  maxBytes: number,
): Promise<MediaFile> {
  const source: MediaSource = parseMediaSource(item.source);
  if (source.kind === 'url') {
    const fetched = await urlBytes(ctx, source.url, maxBytes);
    const kind = resolveMediaKind(item.kind, source.name, fetched.mimeType);
    return {
      data: fetched.data,
      name: mediaFileName(source.name, kind),
      mimeType: fetched.mimeType ?? 'application/octet-stream',
      kind,
      ...(item.caption === undefined ? {} : { caption: item.caption }),
    };
  }
  const stat = await ctx.files.stat(source.path);
  const data = await pathBytes(ctx, source.path, maxBytes);
  const kind = resolveMediaKind(item.kind, source.name, stat.mediaType);
  return {
    data,
    name: mediaFileName(source.name, kind),
    mimeType: stat.mediaType.length === 0 ? 'application/octet-stream' : stat.mediaType,
    kind,
    ...(item.caption === undefined ? {} : { caption: item.caption }),
  };
}

export async function writeMediaFile(
  ctx: AddonContext,
  path: string,
  data: Buffer,
): Promise<{ path: string; size: number }> {
  let written: { path: string; size: number } | null = null;
  let offset = 0;
  while (offset < data.length) {
    const slice = data.subarray(offset, offset + WRITE_CHUNK_BYTES);
    written = await ctx.files.write({
      path,
      data: slice.toString('base64'),
      append: offset > 0,
    });
    offset += slice.length;
  }
  if (written === null) {
    written = await ctx.files.write({ path, data: '' });
  }
  return written;
}