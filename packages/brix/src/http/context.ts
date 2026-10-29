import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from 'hono';

export interface BrixVariables {
  traceId: string;
  [key: string]: unknown;
}

export interface BrixEnv {
  Variables: BrixVariables;
}

export type BrixContext = Context<BrixEnv>;

export interface TraceSource {
  get(key: string): unknown;
  req: { header(name: string): string | undefined };
}

export const TRACE_ID_KEY = 'traceId';

export function createTraceId(header: string | undefined): string {
  return header ?? crypto.randomUUID();
}

export function getTraceId(source: TraceSource): string | undefined {
  const stored = source.get(TRACE_ID_KEY);
  return typeof stored === 'string' ? stored : (source.req.header('x-request-id') ?? undefined);
}

export interface RequestContextStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export interface RequestContext {
  request: Request;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function createRequestContext(request: Request, store: RequestContextStore): RequestContext {
  return {
    request,
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      store.set(key, value);
    },
  };
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContextStorage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

export function getContextValue<T>(key: string): T | undefined {
  return requestContextStorage.getStore()?.get<T>(key);
}

export function setContextValue<T>(key: string, value: T): void {
  const ctx = requestContextStorage.getStore();
  if (ctx === undefined) {
    throw new Error('setContextValue called outside of a request context');
  }
  ctx.set(key, value);
}
