import { basename, isAbsolute, resolve, sep } from 'node:path';

export const THREAD_FILE_ROOTS = ['attachments', 'sandbox'] as const;

export function resolveThreadEntryPath(threadDir: string, relativePath: string): string | null {
  const trimmed = relativePath.replaceAll('\\', '/');
  if (!trimmed || isAbsolute(trimmed) || trimmed.includes('\0')) {
    return null;
  }
  const base = resolve(threadDir);
  const abs = resolve(base, trimmed);
  if (abs !== base && !abs.startsWith(`${base}${sep}`)) {
    return null;
  }
  const [root] = trimmed.split('/');
  if (!root || !THREAD_FILE_ROOTS.includes(root as (typeof THREAD_FILE_ROOTS)[number])) {
    return null;
  }
  return abs;
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  xml: 'application/xml',
  json: 'application/json',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export function threadFileContentType(fileName: string): string {
  const base = basename(fileName);
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
