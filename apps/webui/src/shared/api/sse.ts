import { SSE_STALL_TIMEOUT_MS } from '@harnesys/studio-shared';
import { trace } from '../lib/trace';
import { getActiveOrgId, subscribeActiveOrg } from './active-org';
import { authenticatedFetch } from './session';
import { readSse } from './sse-read';

/** A 4xx (except 408/429) will not succeed on retry — reconnecting would be polling. */
class SsePermanentError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`sse open failed ${status}`);
    this.name = 'SsePermanentError';
    this.status = status;
  }
}

function isPermanentOpenFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

interface Subscription {
  onData: (data: string) => void;
  onOpen?: () => void;
  onError?: () => void;
}

interface FetchSseConnection {
  key: string;
  url: string;
  orgId: string;
  refs: number;
  listeners: Map<string, Set<Subscription>>;
  abort: AbortController;
  open: boolean;
  lastId?: string;
}

const SSE_STABLE_MS = 10_000;
const SSE_RECONNECT_DELAY_MS = 1_000;

const connections = new Map<string, FetchSseConnection>();
const pendingListeners = new Map<string, Map<string, Set<Subscription>>>();

export interface WatchEventSourceOptions {
  onOpen?: () => void;
  onError?: () => void;
  orgId?: string;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }
  return error instanceof Error && error.name === 'AbortError';
}

export function watchEventSource(
  url: string,
  event: string,
  onData: (data: string) => void,
  options?: WatchEventSourceOptions,
): () => void {
  const sub: Subscription = { onData, onOpen: options?.onOpen, onError: options?.onError };
  const orgId = options?.orgId ?? getActiveOrgId();
  if (orgId) {
    attach(url, orgId, event, sub);
    return () => detach(url, event, sub);
  }
  // The active org is resolved only after bootstrapping, so opening the stream
  // now would hit the guard without X-Org-Id (400). Hold the subscriber until
  // setCurrentOrgId provides one, then attach without a rejected request.
  addPending(url, event, sub);
  const unsubscribeOrg = subscribeActiveOrg(() => {
    const resolved = getActiveOrgId();
    if (!resolved || !removePending(url, event, sub)) {
      return;
    }
    attach(url, resolved, event, sub);
  });
  return () => {
    unsubscribeOrg();
    removePending(url, event, sub);
    detach(url, event, sub);
  };
}

function addPending(url: string, event: string, sub: Subscription): void {
  let byEvent = pendingListeners.get(url);
  if (!byEvent) {
    byEvent = new Map();
    pendingListeners.set(url, byEvent);
  }
  let set = byEvent.get(event);
  if (!set) {
    set = new Set();
    byEvent.set(event, set);
  }
  set.add(sub);
}

function removePending(url: string, event: string, sub: Subscription): boolean {
  const byEvent = pendingListeners.get(url);
  const set = byEvent?.get(event);
  if (!set?.delete(sub)) {
    return false;
  }
  if (set.size === 0) {
    byEvent?.delete(event);
  }
  if (byEvent && byEvent.size === 0) {
    pendingListeners.delete(url);
  }
  return true;
}

function attach(url: string, orgId: string, event: string, sub: Subscription): void {
  const key = `${url}::${orgId}`;
  let conn = connections.get(key);
  if (!conn) {
    const abort = new AbortController();
    conn = { key, url, orgId, refs: 0, listeners: new Map(), abort, open: false };
    connections.set(key, conn);
    void maintainConnection(key);
  }
  conn.refs += 1;
  let set = conn.listeners.get(event);
  if (!set) {
    set = new Set();
    conn.listeners.set(event, set);
  }
  set.add(sub);
  if (conn.open) {
    sub.onOpen?.();
  }
}

function detach(url: string, event: string, sub: Subscription): void {
  for (const conn of connections.values()) {
    if (conn.url !== url) {
      continue;
    }
    const set = conn.listeners.get(event);
    if (!set?.delete(sub)) {
      continue;
    }
    conn.refs -= 1;
    if (conn.refs > 0) {
      return;
    }
    scheduleClose(conn);
    return;
  }
}

function scheduleClose(conn: FetchSseConnection): void {
  void Promise.resolve().then(() => {
    const still = connections.get(conn.key);
    if (!still || still !== conn || still.refs > 0) {
      return;
    }
    still.abort.abort();
    connections.delete(conn.key);
  });
}

async function maintainConnection(key: string): Promise<void> {
  let attempt = 0;
  while (true) {
    const conn = connections.get(key);
    if (!conn || conn.abort.signal.aborted) {
      return;
    }
    const openedAt = Date.now();
    const failure = await runAttempt(conn);
    if (conn.abort.signal.aborted || (failure !== null && isAbortError(failure))) {
      return;
    }
    if (failure instanceof SsePermanentError) {
      trace('sse', `giving up after permanent ${failure.status}`);
      notifyError(conn);
      return;
    }
    const current = connections.get(key);
    if (!current) {
      return;
    }
    const stable = Date.now() - openedAt >= SSE_STABLE_MS;
    if (failure === null) {
      attempt = 0;
      await waitForRetry(current, SSE_RECONNECT_DELAY_MS);
      continue;
    }
    notifyError(current);
    const delay = stable ? SSE_RECONNECT_DELAY_MS : nextBackoff(attempt);
    attempt = stable ? 0 : attempt + 1;
    await waitForRetry(current, delay);
  }
}

async function runAttempt(conn: FetchSseConnection): Promise<unknown> {
  try {
    await openSseOnce(conn);
    return null;
  } catch (error) {
    return error;
  }
}

function notifyError(conn: FetchSseConnection): void {
  for (const set of conn.listeners.values()) {
    for (const sub of set) {
      sub.onError?.();
    }
  }
}

function waitForRetry(conn: FetchSseConnection, ms: number): Promise<void> {
  if (conn.abort.signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      conn.abort.signal.removeEventListener('abort', finish);
      resolve();
    };
    timer = setTimeout(finish, ms);
    conn.abort.signal.addEventListener('abort', finish, { once: true });
  });
}

async function openSseOnce(conn: FetchSseConnection): Promise<void> {
  async function fetchResponse(includeLastId: boolean): Promise<Response> {
    const headers = new Headers();
    if (conn.orgId) {
      headers.set('X-Org-Id', conn.orgId);
    }
    if (includeLastId && conn.lastId) {
      headers.set('Last-Event-ID', conn.lastId);
    }
    return authenticatedFetch(conn.url, { headers, signal: conn.abort.signal });
  }
  let response = await fetchResponse(true);
  if (!response.ok && response.status === 400 && conn.lastId !== undefined) {
    conn.lastId = undefined;
    trace('sse', 'retrying without stale Last-Event-ID');
    response = await fetchResponse(false);
  }
  if (!response.ok) {
    trace('sse', `open failed ${response.status}`);
    if (isPermanentOpenFailure(response.status)) {
      throw new SsePermanentError(response.status);
    }
    throw new Error(`sse open failed ${response.status}`);
  }
  conn.open = true;
  for (const set of conn.listeners.values()) {
    for (const sub of set) {
      sub.onOpen?.();
    }
  }
  try {
    for await (const frame of readSse(response, { idleTimeoutMs: SSE_STALL_TIMEOUT_MS })) {
      const current = connections.get(conn.key);
      if (!current) {
        return;
      }
      if (frame.id) {
        current.lastId = frame.id;
      }
      for (const sub of current.listeners.get(frame.event) ?? []) {
        try {
          sub.onData(frame.data);
        } catch (error) {
          trace('sse', `listener failed for ${frame.event}`, error);
        }
      }
    }
  } finally {
    conn.open = false;
  }
}

function nextBackoff(attempt: number): number {
  const ms = 1000 * 2 ** attempt;
  return Math.min(ms, 30_000);
}
