import { AddonError } from '@harnesys/sdk';

export interface UrlMediaSource {
  kind: 'url';
  url: string;
  name: string;
}

export interface PathMediaSource {
  kind: 'path';
  path: string;
  name: string;
}

export type MediaSource = UrlMediaSource | PathMediaSource;

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_PATH = /^[a-z]:[\\/]/i;

function invalidSource(value: string, reason: string): AddonError {
  return new AddonError('invalid_params', {
    detail: `source must be an https url or a file path inside the workspace, got "${value}" (${reason})`,
  });
}

function fileNameOfPath(path: string): string {
  const segments = path.split('/').filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? 'file';
}

function fileNameOfUrl(url: URL): string {
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const last = segments[segments.length - 1] ?? 'file';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function workspacePathOf(value: string): string {
  const raw = value.trim();
  if (raw.length === 0) {
    throw invalidSource(value, 'empty path');
  }
  if (raw.toLowerCase().startsWith('file://')) {
    throw invalidSource(value, 'file:// is not allowed');
  }
  if (SCHEME.test(raw) || WINDOWS_PATH.test(raw)) {
    throw invalidSource(value, 'schemes and drive letters are not allowed');
  }
  if (raw.startsWith('/') || raw.startsWith('\\') || raw.startsWith('~')) {
    throw invalidSource(value, 'absolute paths are not allowed');
  }
  const segments: string[] = [];
  for (const segment of raw.split(/[\\/]+/)) {
    if (segment.length === 0 || segment === '.') {
      continue;
    }
    if (segment === '..') {
      throw invalidSource(value, '.. leaves the workspace');
    }
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw invalidSource(value, 'empty path');
  }
  return segments.join('/');
}

export function parseMediaSource(value: unknown): MediaSource {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AddonError('invalid_params', { detail: 'source is required' });
  }
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith('https://')) {
    const url = new URL(raw);
    if (url.hostname.length === 0) {
      throw invalidSource(value, 'missing host');
    }
    return { kind: 'url', url: url.toString(), name: fileNameOfUrl(url) };
  }
  if (lower.startsWith('http://')) {
    throw invalidSource(value, 'only https urls are fetched');
  }
  if (SCHEME.test(raw)) {
    throw invalidSource(value, 'only https urls are fetched');
  }
  const path = workspacePathOf(raw);
  return { kind: 'path', path, name: fileNameOfPath(path) };
}