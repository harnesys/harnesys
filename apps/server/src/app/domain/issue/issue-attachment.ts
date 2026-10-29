import { join } from 'node:path';
import type { HostFsLayoutPort } from '../machine/host-fs-layout.port.ts';

export const MAX_ISSUE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function issueDir(layout: HostFsLayoutPort, orgId: string, issueId: string): string {
  return join(layout.orgDataDir(orgId), 'issues', issueId);
}

const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  dxf: 'application/dxf',
};

export function mediaTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_TYPES_BY_EXTENSION[extension] ?? 'application/octet-stream';
}
