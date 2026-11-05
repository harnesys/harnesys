import { trace } from '../lib/trace';
import { getActiveOrgId } from './active-org';
import { authenticatedFetch } from './session';

export interface SseFrame {
  event: string;
  data: string;
  id?: string;
}

export async function* readSse(response: Response): AsyncGenerator<SseFrame> {
  if (!response.body) {
    trace('sse', 'no response body');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const chunk = await reader.read();
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
  retryTimer?: ReturnType<typeof setTimeout>;
  open: boolean;
  lastId?: string;
}

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
      if (still.retryTimer) {
        clearTimeout(still.retryTimer);
        still.retryTimer = undefined;
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
    try {
      await openSseOnce(conn);
      attempt = 0;
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      const current = connections.get(key);
      if (!current) {
        return;
      }
      for (const set of current.listeners.values()) {
        for (const sub of set) {
          sub.onError?.();
        }
      }
      if (current.abort.signal.aborted) {
        return;
      }
      const delay = nextBackoff(attempt);
      attempt += 1;
      await new Promise<void>((resolve) => {
        current.retryTimer = setTimeout(resolve, delay);
      });
      if (current.retryTimer) {
        clearTimeout(current.retryTimer);
        current.retryTimer = undefined;
      }
    }
  }
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
    throw new Error(`sse open failed ${response.status}`);
  }
  conn.open = true;
  for (const set of conn.listeners.values()) {
    for (const sub of set) {
      sub.onOpen?.();
    }
  }
  for await (const frame of readSse(response)) {
    const current = connections.get(conn.key);
    if (!current) {
      return;
    }
    if (frame.id) {
      current.lastId = frame.id;
    }
    for (const sub of current.listeners.get(frame.event) ?? []) {
      sub.onData(frame.data);
    }
  }
  conn.open = false;
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
