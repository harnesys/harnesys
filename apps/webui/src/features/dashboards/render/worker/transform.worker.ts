import { WidgetNodeSchema } from '@harnesys/contracts';
import { getPath } from '../data/get-path';
import type {
  BridgeFetchInit,
  TransformBridge,
  TransformWorkerInbound,
  TransformWorkerOutbound,
} from '../types';

/**
 * The worker IS the sandbox: user transform source runs via `new Function`
 * with no DOM and no app globals. Every network call is an RPC to the main
 * thread, which owns auth, the org guard and the egress audit; the worker
 * itself has no reachable network primitive after module init.
 */

const MAX_STACK_LINES = 4;

const LOCKED_NETWORK_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'BroadcastChannel',
] as const;

let rpcNextId = 1;
const rpcPending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();

function blockedGlobal(name: string): () => never {
  return () => {
    throw new Error(`${name} is not available in widget transform code; use bridge instead`);
  };
}

/**
 * Replaces every network global with a throwing stub, once, at module init.
 * `writable: false, configurable: false` means neither user code nor anything
 * loaded later can restore the real primitive. In a worker `self` and
 * `globalThis` are the same object; the Set keeps them from being defined twice.
 */
function lockNetworkGlobals(): void {
  const targets = new Set<object>([self, globalThis]);
  for (const name of LOCKED_NETWORK_GLOBALS) {
    for (const target of targets) {
      if (Object.getOwnPropertyDescriptor(target, name)?.configurable === false) {
        continue;
      }
      Object.defineProperty(target, name, {
        value: blockedGlobal(name),
        writable: false,
        configurable: false,
      });
    }
  }
}

lockNetworkGlobals();

function sendRpc(id: number, message: TransformWorkerOutbound): Promise<unknown> {
  return new Promise((resolve, reject) => {
    try {
      self.postMessage(message);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    rpcPending.set(id, { resolve, reject });
  });
}

function callMain(sourceId: string): Promise<unknown> {
  const id = rpcNextId++;
  return sendRpc(id, { kind: 'rpc', id, sourceId });
}

function callOurApi(path: string, init?: BridgeFetchInit): Promise<unknown> {
  const id = rpcNextId++;
  return sendRpc(id, { kind: 'rpc-our-api', id, path, init });
}

const bridge: TransformBridge = {
  fetchOurApi(path: string, init?: BridgeFetchInit): Promise<unknown> {
    return callOurApi(path, init);
  },

  fetchExternal(sourceId: string): Promise<unknown> {
    return callMain(sourceId);
  },
};

const utils = {
  groupBy<T>(items: T[], key: string): Record<string, T[]> {
    const out: Record<string, T[]> = {};
    for (const item of items) {
      const bucket = String(getPath(item, key) ?? '');
      const list = out[bucket];
      if (list) {
        list.push(item);
      } else {
        out[bucket] = [item];
      }
    }
    return out;
  },

  sum(items: Array<number | Record<string, unknown>>, key?: string): number {
    let total = 0;
    for (const item of items) {
      if (typeof item === 'number') {
        total += item;
      } else if (key) {
        const value = getPath(item, key);
        if (typeof value === 'number') {
          total += value;
        }
      }
    }
    return total;
  },

  avg(items: Array<number | Record<string, unknown>>, key?: string): number {
    let total = 0;
    let count = 0;
    for (const item of items) {
      if (typeof item === 'number') {
        total += item;
        count += 1;
      } else if (key) {
        const value = getPath(item, key);
        if (typeof value === 'number') {
          total += value;
          count += 1;
        }
      }
    }
    return count === 0 ? 0 : total / count;
  },

  sortBy<T>(items: T[], key?: string, direction: 'asc' | 'desc' = 'asc'): T[] {
    const factor = direction === 'desc' ? -1 : 1;
    return [...items].sort((a, b) => {
      const left = key ? getPath(a, key) : a;
      const right = key ? getPath(b, key) : b;
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * factor;
      }
      return String(left ?? '').localeCompare(String(right ?? '')) * factor;
    });
  },

  unique<T>(items: T[]): T[] {
    return [...new Set(items)];
  },

  clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  },

  formatDate(value: unknown, style: 'short' | 'medium' | 'long' | 'iso' = 'medium'): string {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    if (style === 'iso') {
      return date.toISOString();
    }
    return date.toLocaleString(undefined, {
      dateStyle: style,
      timeStyle: style === 'long' ? 'long' : 'short',
    });
  },
};

function postRunError(id: number, error: unknown): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const stack =
    typeof err.stack === 'string'
      ? err.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n')
      : undefined;
  const message: TransformWorkerOutbound = {
    kind: 'run-result',
    id,
    ok: false,
    message: err.message,
    stack,
  };
  self.postMessage(message);
}

function postRunNode(id: number, raw: unknown): boolean {
  const parsed = WidgetNodeSchema.safeParse(raw);
  if (!parsed.success) {
    postRunError(
      id,
      new Error(`Transform result failed WidgetNode validation: ${parsed.error.message}`),
    );
    return true;
  }
  self.postMessage({
    kind: 'run-result',
    id,
    ok: true,
    resultKind: 'node',
    node: parsed.data,
  } satisfies TransformWorkerOutbound);
  return true;
}

function postRunData(id: number, data: unknown): void {
  const message: TransformWorkerOutbound = {
    kind: 'run-result',
    id,
    ok: true,
    resultKind: 'data',
    data: data ?? null,
  };
  try {
    self.postMessage(message);
  } catch {
    postRunError(
      id,
      new Error('Transform returned a value that cannot be cloned (functions are not allowed)'),
    );
  }
}

function isNodeLike(value: unknown): boolean {
  return (
    value !== null && typeof value === 'object' && !Array.isArray(value) && 'primitive' in value
  );
}

async function handleRun(msg: Extract<TransformWorkerInbound, { kind: 'run' }>): Promise<void> {
  try {
    // Network globals are already locked at module init (see lockNetworkGlobals).
    // These parameter shadows are a second layer only: they make the blocked
    // names visible to `new Function` scope, nothing relies on them for safety.
    const fn = new Function(
      'sources',
      'config',
      'bridge',
      'utils',
      'fetch',
      'WebSocket',
      'EventSource',
      'XMLHttpRequest',
      `"use strict";\n${msg.code}`,
    );
    const raw: unknown = await fn(
      msg.sources,
      msg.config,
      bridge,
      utils,
      blockedGlobal('fetch'),
      blockedGlobal('WebSocket'),
      blockedGlobal('EventSource'),
      blockedGlobal('XMLHttpRequest'),
    );
    if (isNodeLike(raw)) {
      postRunNode(msg.id, raw);
      return;
    }
    if (Array.isArray(raw) && raw.length > 0 && raw.every(isNodeLike)) {
      postRunNode(msg.id, { primitive: 'custom', props: {}, children: raw });
      return;
    }
    postRunData(msg.id, raw);
  } catch (error) {
    postRunError(msg.id, error);
  }
}

self.onmessage = (event: MessageEvent<TransformWorkerInbound>): void => {
  const msg = event.data;
  if (msg.kind === 'rpc-result') {
    const pending = rpcPending.get(msg.id);
    if (!pending) {
      return;
    }
    rpcPending.delete(msg.id);
    if (msg.ok) {
      pending.resolve(msg.value ?? null);
    } else {
      pending.reject(new Error(msg.error ?? 'Bridge RPC failed'));
    }
    return;
  }
  if (msg.kind === 'run') {
    void handleRun(msg);
  }
};
