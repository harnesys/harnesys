import { apiUrl } from './client';
import { selfNodeCached } from './fleet';
import { authenticatedFetch } from './session';

export interface ContentEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
  mtime?: string;
}

export interface ContentTreeResponse {
  path: string;
  entries: ContentEntry[];
  truncated?: boolean;
}

export interface ContentReadResult {
  path: string;
  etag: string;
  size: number;
  encoding: 'utf-8' | 'base64';
  content: string;
}

export interface ContentWriteResult {
  path: string;
  etag: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;

  constructor(status: number, message: string, errorCode: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
  }
}

async function apiRequest(
  path: string,
  init?: RequestInit & { orgId?: string },
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.orgId) {
    headers.set('X-Org-Id', init.orgId);
  }
  const surfaceHostId = selfNodeCached();
  if (surfaceHostId) {
    headers.set('X-Surface-Host-Id', surfaceHostId);
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { orgId: _orgId, ...rest } = init ?? {};
  return authenticatedFetch(apiUrl(path), { ...rest, headers });
}

async function parseJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function throwApiError(response: Response, body: unknown): never {
  const message =
    body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
      ? body.message
      : response.statusText || `request failed (${response.status})`;
  const errorCode =
    body && typeof body === 'object' && 'errorCode' in body && typeof body.errorCode === 'string'
      ? body.errorCode
      : null;
  throw new ApiError(response.status, message, errorCode);
}

export async function listContentTree(
  orgId: string,
  sourceId: string,
  path = '',
  worktreeId?: string,
): Promise<ContentTreeResponse> {
  const qs = new URLSearchParams();
  if (path) {
    qs.set('path', path);
  }
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const response = await apiRequest(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/content/tree${suffix}`,
    { orgId },
  );
  const body = await parseJsonBody(response);
  if (!response.ok) {
    throwApiError(response, body);
  }
  return body as ContentTreeResponse;
}

export async function readContentFile(
  orgId: string,
  sourceId: string,
  path: string,
  worktreeId?: string,
): Promise<ContentReadResult> {
  const qs = new URLSearchParams({ path });
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  const response = await apiRequest(
    `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/content/read?${qs}`,
    { orgId },
  );
  const body = await parseJsonBody(response);
  if (!response.ok) {
    throwApiError(response, body);
  }
  const meta = body as ContentReadResult;
  const etag = response.headers.get('ETag') ?? meta.etag;
  return { ...meta, etag };
}

export interface WriteContentInput {
  orgId: string;
  sourceId: string;
  path: string;
  content: string;
  ifMatch?: string | null;
  worktreeId?: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function writeContentBytes(input: {
  orgId: string;
  sourceId: string;
  path: string;
  bytes: Uint8Array;
  worktreeId?: string;
}): Promise<ContentWriteResult> {
  const qs = new URLSearchParams({ path: input.path });
  if (input.worktreeId) {
    qs.set('worktreeId', input.worktreeId);
  }
  const response = await apiRequest(
    `/api/orgs/${encodeURIComponent(input.orgId)}/sources/${encodeURIComponent(input.sourceId)}/content/write?${qs}`,
    {
      method: 'PUT',
      orgId: input.orgId,
      body: JSON.stringify({
        content: bytesToBase64(input.bytes),
        encoding: 'base64',
      }),
    },
  );
  const body = await parseJsonBody(response);
  if (!response.ok) {
    throwApiError(response, body);
  }
  return body as ContentWriteResult;
}

export async function writeContentFile(input: WriteContentInput): Promise<ContentWriteResult> {
  const qs = new URLSearchParams({ path: input.path });
  if (input.worktreeId) {
    qs.set('worktreeId', input.worktreeId);
  }
  const headers = new Headers();
  if (input.ifMatch) {
    headers.set('If-Match', input.ifMatch);
  }
  const response = await apiRequest(
    `/api/orgs/${encodeURIComponent(input.orgId)}/sources/${encodeURIComponent(input.sourceId)}/content/write?${qs}`,
    {
      method: 'PUT',
      orgId: input.orgId,
      headers,
      body: JSON.stringify({ content: input.content, encoding: 'utf-8' }),
    },
  );
  const body = await parseJsonBody(response);
  if (!response.ok) {
    throwApiError(response, body);
  }
  return body as ContentWriteResult;
}

function contentPath(orgId: string, sourceId: string, suffix: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/sources/${encodeURIComponent(sourceId)}/content${suffix}`;
}

export async function duplicateContentPath(
  orgId: string,
  sourceId: string,
  path: string,
  worktreeId?: string,
): Promise<{ path: string }> {
  const response = await apiRequest(contentPath(orgId, sourceId, '/duplicate'), {
    method: 'POST',
    orgId,
    body: JSON.stringify({ path, ...(worktreeId ? { worktreeId } : {}) }),
  });
  const body = await parseJsonBody(response);
  if (!response.ok) {
    throwApiError(response, body);
  }
  return body as { path: string };
}

export async function revealContentPath(
  orgId: string,
  sourceId: string,
  path: string,
  worktreeId?: string,
): Promise<void> {
  const response = await apiRequest(contentPath(orgId, sourceId, '/reveal'), {
    method: 'POST',
    orgId,
    body: JSON.stringify({ path, ...(worktreeId ? { worktreeId } : {}) }),
  });
  if (!response.ok) {
    throwApiError(response, await parseJsonBody(response));
  }
}

export async function fetchContentBlob(
  orgId: string,
  sourceId: string,
  path: string,
  worktreeId?: string,
): Promise<Blob> {
  const qs = new URLSearchParams({ path });
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  const response = await apiRequest(`${contentPath(orgId, sourceId, '/read')}?${qs}`, { orgId });
  if (!response.ok) {
    throwApiError(response, await parseJsonBody(response));
  }
  const body = (await parseJsonBody(response)) as ContentReadResult;
  if (body.encoding === 'utf-8') {
    return new Blob([body.content], { type: mimeFromName(body.path) });
  }
  const bytes = base64ToBytes(body.content);
  return new Blob([bytes], { type: mimeFromName(body.path) });
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
};

function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

export async function downloadContentEntry(
  orgId: string,
  sourceId: string,
  path: string,
  worktreeId?: string,
): Promise<Blob> {
  const qs = new URLSearchParams({ path });
  if (worktreeId) {
    qs.set('worktreeId', worktreeId);
  }
  const response = await apiRequest(contentPath(orgId, sourceId, `/download?${qs}`), { orgId });
  if (!response.ok) {
    throwApiError(response, await parseJsonBody(response));
  }
  return response.blob();
}
