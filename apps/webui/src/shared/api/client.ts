import type { StudioErrorBody } from '@harnesys/studio-shared';
import { env } from '@/shared/config/env';
import { getActiveOrgId } from './active-org';
import { authenticatedFetch } from './session';

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ApiJsonOptions = RequestInit;

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${env.localHostOrigin}${p}`;
}

function isMachineOrgsPath(path: string): boolean {
  const pathname = path.startsWith('http') ? new URL(path).pathname : (path.split('?')[0] ?? path);
  return (
    pathname === '/api/orgs' ||
    /^\/api\/orgs\/[^/]+$/.test(pathname) ||
    /^\/api\/orgs\/[^/]+\/activate$/.test(pathname)
  );
}

function applyAuthHeaders(headers: Headers, path: string): void {
  const orgId = getActiveOrgId();
  if (orgId && !headers.has('X-Org-Id') && !isMachineOrgsPath(path)) {
    headers.set('X-Org-Id', orgId);
  }
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback;
  }
  const record = body as StudioErrorBody & { message?: string };
  return record.error ?? record.message ?? fallback;
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  let message = response.statusText || 'Request failed';
  let body: unknown;
  try {
    body = await response.json();
    message = errorMessageFromBody(body, message);
  } catch {
    // keep status text
  }
  throw new ApiError(response.status, message, body);
}

export async function apiJson<T>(path: string, init?: ApiJsonOptions): Promise<T> {
  return requestJson<T>(path, init);
}

async function requestJson<T>(path: string, init?: ApiJsonOptions): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  applyAuthHeaders(headers, path);
  const response = await authenticatedFetch(apiUrl(path), { ...init, headers });
  if (response.status === 204) {
    return undefined as T;
  }
  await throwIfNotOk(response);
  return (await response.json()) as T;
}
