import { env } from '@/shared/config/env';

export interface LoginGrant {
  accessToken: string;
  accessExpiresAt: string | null;
}

export class SessionFailure extends Error {
  status: number;
  errorCode: string;
  retryAfterSec: number | null;

  constructor(
    status: number,
    errorCode: string,
    message: string,
    retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = 'SessionFailure';
    this.status = status;
    this.errorCode = errorCode;
    this.retryAfterSec = retryAfterSec;
  }
}

let accessToken: string | null = null;
let refreshInflight: Promise<boolean> | null = null;
const deadListeners = new Set<() => void>();
const readyListeners = new Set<() => void>();

function notifySessionReady(): void {
  for (const listener of readyListeners) {
    listener();
  }
}

export function subscribeSessionReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
  };
}

export function getAccess(): string | null {
  return accessToken;
}

export function setAccess(token: string): void {
  accessToken = token;
}

export function clearAccess(): void {
  accessToken = null;
}

export function notifySessionDead(): void {
  accessToken = null;
  for (const listener of deadListeners) {
    listener();
  }
}

export function subscribeSessionDead(listener: () => void): () => void {
  deadListeners.add(listener);
  return () => {
    deadListeners.delete(listener);
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function retryAfterOf(body: unknown): number | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const record = body as { retryAfterSec?: unknown; details?: { retryAfterSec?: unknown } };
  const direct = record.retryAfterSec;
  if (typeof direct === 'number') {
    return direct;
  }
  const nested = record.details?.retryAfterSec;
  return typeof nested === 'number' ? nested : null;
}

function errorCodeOf(body: unknown): string {
  if (body && typeof body === 'object' && 'errorCode' in body) {
    const value = (body as { errorCode?: unknown }).errorCode;
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return 'SESSION_ERROR';
}

async function toSessionFailure(response: Response): Promise<SessionFailure> {
  const body = await readJson(response);
  let message = response.statusText || 'Session request failed';
  if (body && typeof body === 'object' && 'message' in body) {
    const value = (body as { message?: unknown }).message;
    if (typeof value === 'string' && value !== '') {
      message = value;
    }
  }
  return new SessionFailure(response.status, errorCodeOf(body), message, retryAfterOf(body));
}

export async function sessionLogin(login: string, password: string): Promise<LoginGrant> {
  const response = await fetch(`${env.localHostOrigin}/api/session/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!response.ok) {
    throw await toSessionFailure(response);
  }
  const body = (await readJson(response)) as { accessToken?: unknown; accessExpiresAt?: unknown };
  if (typeof body?.accessToken !== 'string' || body.accessToken === '') {
    throw new SessionFailure(
      response.status,
      'SESSION_ERROR',
      'Login response has no access token',
    );
  }
  accessToken = body.accessToken;
  notifySessionReady();
  return {
    accessToken: body.accessToken,
    accessExpiresAt: typeof body.accessExpiresAt === 'string' ? body.accessExpiresAt : null,
  };
}

async function performRefresh(): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`${env.localHostOrigin}/api/session/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    notifySessionDead();
    return false;
  }
  if (!response.ok) {
    notifySessionDead();
    return false;
  }
  const body = (await readJson(response)) as { accessToken?: unknown };
  if (typeof body?.accessToken !== 'string' || body.accessToken === '') {
    notifySessionDead();
    return false;
  }
  accessToken = body.accessToken;
  return true;
}

export function sessionRefresh(): Promise<boolean> {
  if (!refreshInflight) {
    refreshInflight = performRefresh().finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

export async function sessionLogout(): Promise<void> {
  try {
    await fetch(`${env.localHostOrigin}/api/session/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } finally {
    accessToken = null;
  }
}

export async function sessionOwnerStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${env.localHostOrigin}/api/session/owner/status`);
    if (!response.ok) {
      return true;
    }
    const body = (await readJson(response)) as { initialized?: unknown };
    return body?.initialized !== false;
  } catch {
    return true;
  }
}

export interface OwnerInitInput {
  login: string;
  name: string;
  password: string;
}

export async function sessionOwnerInit(input: OwnerInitInput): Promise<void> {
  const response = await fetch(`${env.localHostOrigin}/api/session/owner/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await toSessionFailure(response);
  }
}

function withAccessHeader(init?: RequestInit): RequestInit | undefined {
  if (!accessToken) {
    return init;
  }
  const headers = new Headers(init?.headers);
  if (headers.has('Authorization')) {
    return init;
  }
  headers.set('Authorization', `Bearer ${accessToken}`);
  return { ...init, headers };
}

function bearerOf(init?: RequestInit): RequestInit | undefined {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    return init;
  }
  headers.delete('Authorization');
  return { ...init, headers };
}

export async function authenticatedFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, withAccessHeader(init));
  if (response.status !== 401) {
    return response;
  }
  const swapped = await sessionRefresh();
  if (!swapped) {
    return response;
  }
  return fetch(input, withAccessHeader(bearerOf(init)));
}
