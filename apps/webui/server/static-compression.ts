import { brotliCompress, constants, gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { extname } from 'node:path';

const brotliAsync = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.map',
  '.svg',
  '.txt',
  '.webmanifest',
]);

const MIN_SIZE_BYTES = 1024;
const MAX_CACHE_BYTES = 48 * 1024 * 1024;

export type ContentEncoding = 'br' | 'gzip';

export function isCompressible(target: string, size: number): boolean {
  return size >= MIN_SIZE_BYTES && COMPRESSIBLE_EXTENSIONS.has(extname(target).toLowerCase());
}

export function pickEncoding(acceptEncoding: string | null): ContentEncoding | null {
  if (!acceptEncoding) {
    return null;
  }
  const quality = new Map<string, number>();
  for (const part of acceptEncoding.split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName.trim().toLowerCase();
    if (name === '') {
      continue;
    }
    let q = 1;
    for (const param of params) {
      const [key, value] = param.split('=');
      if (key.trim().toLowerCase() === 'q') {
        const parsed = Number(value);
        q = Number.isFinite(parsed) ? parsed : 0;
      }
    }
    quality.set(name, q);
  }
  const brotli = quality.get('br') ?? 0;
  const gzipQ = quality.get('gzip') ?? 0;
  const wildcard = quality.get('*') ?? 0;
  if (brotli > 0) {
    return 'br';
  }
  if (gzipQ > 0) {
    return 'gzip';
  }
  if (wildcard > 0) {
    return 'gzip';
  }
  return null;
}

interface CacheEntry {
  contentEncoding: ContentEncoding;
  bytes: Uint8Array;
  size: number;
}

const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;

function cacheKey(path: string, mtimeMs: number, encoding: ContentEncoding): string {
  return `${path}\u0000${mtimeMs}\u0000${encoding}`;
}

function remember(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
  cacheBytes += entry.size;
  while (cacheBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next();
    if (oldest.done) {
      break;
    }
    const evicted = cache.get(oldest.value);
    cache.delete(oldest.value);
    cacheBytes -= evicted?.size ?? 0;
  }
}

export async function compressFile(
  path: string,
  mtimeMs: number,
  encoding: ContentEncoding,
): Promise<Uint8Array | null> {
  const key = cacheKey(path, mtimeMs, encoding);
  const cached = cache.get(key);
  if (cached) {
    return cached.bytes;
  }
  const raw = new Uint8Array(await Bun.file(path).arrayBuffer());
  const compressed =
    encoding === 'br'
      ? new Uint8Array(
          await brotliAsync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
        )
      : new Uint8Array(await gzipAsync(raw, { level: 6 }));
  if (compressed.byteLength >= raw.byteLength) {
    return null;
  }
  remember(key, { contentEncoding: encoding, bytes: compressed, size: compressed.byteLength });
  return compressed;
}
