import { SSE_STALL_TIMEOUT_MS } from '@harnesys/studio-shared';
import { trace } from '../lib/trace';
import { getActiveOrgId } from './active-org';
import { authenticatedFetch } from './session';

export interface SseFrame {
  event: string;
  data: string;
  id?: string;
}

export interface ReadSseOptions {
  idleTimeoutMs?: number;
}

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

export async function* readSse(
  response: Response,
  options?: ReadSseOptions,
): AsyncGenerator<SseFrame> {
  if (!response.body) {
    trace('sse', 'no response body');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const idleTimeoutMs = options?.idleTimeoutMs ?? 0;
  let buffer = '';
  try {
    while (true) {
      const chunk =
        idleTimeoutMs > 0 ? await withDeadline(reader.read(), idleTimeoutMs) : await reader.read();
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
      const frames = buffer.split('\n\n');
      buffer = chunk.done ? '' : (frames.pop() ?? '');
      for (const block of frames) {
        const frame = parseBlock(block);
        if (frame) {
          yield frame;
        }
      }
      if (chunk.done) {
        const last = parseBlock(buffer);
        if (last) {
          yield last;
        }
        trace('sse', 'reader done');
        return;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
}

async function withDeadline<T>(read: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sse stream stalled')), ms);
  });
  try {
    return await Promise.race([read, deadline]);
  } finally {
    clearTimeout(timer);
  }
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
  const orgId = options?.orgId ?? getActiveOrgId() ?? '';
  const key = `${url}::${orgId}`;
  let conn = connections.get(key);
  if (!conn) {
    const abort = new AbortController();
    conn = { key, url, orgId, refs: 0, listeners: new Map(), abort, open: false };
    connections.set(key, conn);
    void maintainConnection(key);
  }
  conn.refs += 1;
  const sub: Subscription = { onData, onOpen: options?.onOpen, onError: options?.onError };
  let set = conn.listeners.get(event);
  if (!set) {
    set = new Set();
    conn.listeners.set(event, set);
  }
  set.add(sub);
  if (conn.open) {
    sub.onOpen?.();
  }
  return () => {
    const current = connections.get(key);
    if (!current) {
      return;
    }
    current.listeners.get(event)?.delete(sub);
    current.refs -= 1;
    if (current.refs > 0) {
      return;
    }
    void Promise.resolve().then(() => {
      const still = connections.get(key);
      if (!still || still !== current || still.refs > 0) {
        return;
      }
      still.abort.abort();
      connections.delete(key);
    });
  };
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

function parseBlock(block: string): SseFrame | undefined {
  let event = 'message';
  let id: string | undefined;
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('id:')) {
      const value = line.slice(3).trim();
      id = value || id;
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length === 0) {
    return undefined;
  }
  return { event, data: data.join('\n'), id };
}
