import { AddonError } from '../protocol/error.ts';
import type { FakeHostOptions } from './fake-host.ts';

const MAX_CHUNK_BYTES = 4 * 1024 * 1024;

const FAKE_ROOT = '/fake-host';
const FAKE_WORKSPACE_ROOT = `${FAKE_ROOT}/workspace`;

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

export interface FakeFilesContext {
  options: FakeHostOptions;
  writes: Array<{ path: string; size: number }>;
}

export function executeFilesService(
  method: string,
  params: Record<string, unknown>,
  context: FakeFilesContext,
): unknown {
  if (method === 'files.locate') {
    return locateRoot(params, context);
  }
  const store = context.options.files ?? {};
  const path = normalizePath(String(params.path));
  const key = storeKeyOf(path);
  if (method === 'files.write') {
    return writeFile(store, key, path, params, context.writes);
  }
  const stored = store[key];
  if (stored === undefined) {
    throw new AddonError('not_found', { detail: `no such file: ${path}` });
  }
  if (method === 'files.stat') {
    return statOf(path, stored, context);
  }
  return readChunk(path, stored, params);
}

function storeKeyOf(path: string): string {
  return path.startsWith(`${FAKE_WORKSPACE_ROOT}/`)
    ? path.slice(FAKE_WORKSPACE_ROOT.length + 1)
    : path;
}

function locateRoot(params: Record<string, unknown>, context: FakeFilesContext): unknown {
  const scope = String(params.scope);
  if (scope === 'workspace') {
    return { path: FAKE_WORKSPACE_ROOT };
  }
  if (scope === 'thread') {
    const threadId = context.options.threadId;
    if (threadId === undefined || threadId.length === 0) {
      throw new AddonError('invalid_params', {
        detail: 'thread scope requires a thread context',
      });
    }
    return { path: `${FAKE_ROOT}/threads/${threadId}` };
  }
  throw new AddonError('invalid_params', { detail: `unknown file scope: ${scope}` });
}

function writeFile(
  store: Record<string, string>,
  key: string,
  path: string,
  params: Record<string, unknown>,
  writes: Array<{ path: string; size: number }>,
): unknown {
  const data = decode(String(params.data));
  if (data.byteLength > MAX_CHUNK_BYTES) {
    throw new AddonError('invalid_params', {
      detail: `write chunk exceeds ${MAX_CHUNK_BYTES} bytes`,
    });
  }
  const previous =
    params.append === true && store[key] !== undefined ? decode(store[key]) : Buffer.alloc(0);
  const next = Buffer.concat([previous, data]);
  store[key] = next.toString('base64');
  writes.push({ path, size: next.byteLength });
  return { path, size: next.byteLength };
}

function statOf(path: string, stored: string, context: FakeFilesContext): unknown {
  const bytes = decode(stored);
  return {
    path,
    name: path.split('/').at(-1) ?? path,
    size: bytes.byteLength,
    mediaType: mediaTypeOf(path),
    modifiedAt: new Date(context.options.now?.() ?? 0).toISOString(),
  };
}

function readChunk(path: string, stored: string, params: Record<string, unknown>): unknown {
  const bytes = decode(stored);
  const offset = Number(params.offset ?? 0);
  const requested = Math.min(Number(params.length ?? MAX_CHUNK_BYTES), MAX_CHUNK_BYTES);
  const length = Math.max(0, Math.min(requested, bytes.byteLength - offset));
  const chunk = bytes.subarray(offset, offset + length);
  return {
    data: chunk.toString('base64'),
    eof: offset + length >= bytes.byteLength,
    size: bytes.byteLength,
    mediaType: mediaTypeOf(path),
  };
}

function normalizePath(raw: string): string {
  const normalized = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.includes('\0')) {
    throw new AddonError('invalid_params', { detail: `invalid file path: ${raw}` });
  }
  const absolute = normalized.startsWith('/');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    throw new AddonError('invalid_params', { detail: `invalid file path: ${raw}` });
  }
  return absolute ? `/${segments.join('/')}` : segments.join('/');
}

function mediaTypeOf(path: string): string {
  const extension = path.includes('.') ? path.split('.').at(-1)?.toLowerCase() : undefined;
  if (extension === undefined) {
    return 'application/octet-stream';
  }
  return MEDIA_TYPES[extension] ?? 'application/octet-stream';
}

function decode(base64: string): Buffer {
  return base64 === '' ? Buffer.alloc(0) : Buffer.from(base64, 'base64');
}
