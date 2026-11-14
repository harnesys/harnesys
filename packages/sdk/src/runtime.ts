import type { AddonContext } from './addon-context.ts';
import type {
  NotificationHandlers,
  ResolvedAddonDefinition,
  SourceBackendHandlers,
} from './define-addon.ts';
import { createAddonContextFor, type HostChannel } from './host-client.ts';
import { AddonError, type AddonErrorReason } from './protocol/error.ts';
import {
  type InitializeParams,
  type InitializeResult,
  InitializeResultSchema,
} from './protocol/handshake.ts';
import { methodSpec } from './protocol/map.ts';
import { type CallMeta, CallMetaSchema } from './protocol/meta.ts';

export interface AddonRuntimeOptions {
  definition: ResolvedAddonDefinition;
  addon: { id: string; version: string };
  channel: HostChannel;
  now?(): number;
}

export interface AddonRuntime {
  readonly addon: { id: string; version: string };
  readonly handlers: string[];
  initialize(params: InitializeParams): InitializeResult;
  handleRequest(method: string, params: unknown, signal: AbortSignal): Promise<unknown>;
  handleNotification(method: string, params: unknown, signal: AbortSignal): Promise<void>;
}

type Target = (() => unknown) | null;

export function createAddonRuntime(options: AddonRuntimeOptions): AddonRuntime {
  const { definition, addon, channel } = options;
  const now = options.now ?? (() => Date.now());
  const declared = new Set(definition.handlers);
  const activeTriggerKinds = new Map<string, string>();
  let instanceOrgId: string | undefined;

  function dispatch(method: string, params: Record<string, unknown>, ctx: AddonContext): Target {
    const lookup = dispatchLookup(method, params, ctx);
    if (lookup !== undefined) {
      return lookup;
    }
    return dispatchManaged(method, params, ctx);
  }

  function dispatchLookup(
    method: string,
    params: Record<string, unknown>,
    ctx: AddonContext,
  ): Target | undefined {
    if (method.startsWith('source.')) {
      return sourceLookup(method, params, ctx);
    }
    const lookups: Record<string, () => Target | undefined> = {
      'tools.call': () => toolTarget(params, ctx),
      'route.handle': () => handlerTarget(definition.routes?.[str(params.routeId)], params, ctx),
      'job.run': () => handlerTarget(definition.jobs?.[str(params.jobId)], params, ctx),
      'hook.deliver': () => handlerTarget(definition.hooks?.[str(params.hookId)], params, ctx),
    };
    return lookups[method]?.();
  }

  function toolTarget(params: Record<string, unknown>, ctx: AddonContext): Target {
    const handler = definition.tools?.[str(params.tool)];
    if (handler === undefined) {
      return null;
    }
    return async () => ({ output: await handler(asInput(params.input), ctx) });
  }

  function sourceLookup(
    method: string,
    params: Record<string, unknown>,
    ctx: AddonContext,
  ): Target | undefined {
    const op = method.slice('source.'.length) as keyof SourceBackendHandlers;
    const backend = definition.sources?.[str(params.sourceKind)];
    const handler = backend?.[op];
    return handler ? () => handler(withoutMeta(params) as never, ctx) : null;
  }

  function dispatchManaged(
    method: string,
    params: Record<string, unknown>,
    ctx: AddonContext,
  ): Target {
    switch (method) {
      case 'trigger.start': {
        const kind = str(params.kind);
        if (kind) {
          activeTriggerKinds.set(str(params.instanceId), kind);
        }
        return pairTarget(definition.triggers, kind, 'start', params, ctx);
      }
      case 'trigger.stop': {
        const instanceId = str(params.instanceId);
        const kind = activeTriggerKinds.get(instanceId) ?? '';
        activeTriggerKinds.delete(instanceId);
        return pairTarget(definition.triggers, kind, 'stop', params, ctx);
      }
      case 'worker.start':
        return pairTarget(definition.workers, str(params.workerId), 'start', params, ctx);
      case 'worker.stop':
        return pairTarget(definition.workers, str(params.workerId), 'stop', params, ctx);
      case 'transport.send':
        return optionalTarget(definition.transport?.send, params, ctx);
      case 'transport.edit':
        return optionalTarget(definition.transport?.edit, params, ctx);
      case 'transport.typing':
        return optionalTarget(definition.transport?.typing, params, ctx);
      case 'lifecycle.upgrade':
        return optionalTarget(definition.lifecycle?.upgrade, params, ctx);
      case 'ping':
      case 'shutdown':
        return () => ({});
      default:
        return null;
    }
  }

  async function handleRequest(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<unknown> {
    const spec = methodSpec(method);
    if (spec?.direction !== 'host-to-addon') {
      throw new AddonError('unsupported', {
        detail: `method '${method}' is not a host-to-addon request`,
      });
    }
    if (!declared.has(method)) {
      throw new AddonError('unsupported', {
        detail: `handler '${method}' was not declared in initialize.handlers`,
      });
    }
    const incoming = (params ?? {}) as Record<string, unknown>;
    // Tolerant fallback (§6.3 safety net): hosts that predate mandatory _meta
    // get a synthesized one so the schema parse below still succeeds.
    const guarded = isCallMeta(incoming._meta)
      ? incoming
      : { ...incoming, _meta: fallbackMeta('host-request', now() + FALLBACK_DEADLINE_MS) };
    const parsed = parseParams(spec, guarded) as Record<string, unknown>;
    const meta = CallMetaSchema.parse(parsed._meta);
    if (instanceOrgId !== undefined) {
      meta.orgId = instanceOrgId;
    }
    if (meta.deadline < now()) {
      throw new AddonError('timeout', { detail: `deadline ${meta.deadline} has passed` });
    }
    const ctx = createAddonContextFor(channel, meta, signal);
    const target = dispatch(method, parsed, ctx);
    if (!target) {
      throw new AddonError('unsupported', { detail: `no handler registered for '${method}'` });
    }
    const raw = await runWithDeadline(target(), meta.deadline, now, signal);
    return parseResult(spec, raw);
  }

  function parseResult(
    spec: { result: { parse(input: unknown): unknown } | null },
    raw: unknown,
  ): unknown {
    if (!spec.result) {
      return raw;
    }
    try {
      return spec.result.parse(raw ?? {});
    } catch (error) {
      throw new AddonError('invalid_response', {
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function parseParams(
    spec: { params: { parse(input: unknown): unknown } },
    params: unknown,
  ): unknown {
    try {
      return spec.params.parse(params);
    } catch (error) {
      throw new AddonError('invalid_params', {
        detail: `${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async function handleNotification(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<void> {
    if (method === 'initialized') {
      return;
    }
    const spec = methodSpec(method);
    if (spec?.direction !== 'notification' || spec.sender === 'addon') {
      throw new AddonError('unsupported', {
        detail: `method '${method}' is not a host notification`,
      });
    }
    const parsed = spec.params.parse(params) as Record<string, unknown>;
    const handler = definition.notifications?.[method as keyof NotificationHandlers];
    if (!handler) {
      return;
    }
    const ctx = createAddonContextFor(
      channel,
      fallbackMeta('notification', Number.MAX_SAFE_INTEGER),
      signal,
    );
    await handler(parsed as never, ctx);
  }

  function initialize(params: InitializeParams): InitializeResult {
    instanceOrgId = params.instance.orgId;
    return InitializeResultSchema.parse({
      addon: { id: addon.id, version: addon.version },
      handlers: definition.handlers,
    });
  }

  return { addon, handlers: definition.handlers, initialize, handleRequest, handleNotification };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInput(input: unknown): Record<string, unknown> {
  return typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
}

function withoutMeta<P extends { _meta?: unknown }>(params: P): Omit<P, '_meta'> {
  const copy = { ...params };
  delete copy._meta;
  return copy as Omit<P, '_meta'>;
}

function handlerTarget(
  handler: unknown,
  params: Record<string, unknown>,
  ctx: AddonContext,
): Target {
  if (typeof handler !== 'function') {
    return null;
  }
  return () =>
    (handler as (p: Record<string, unknown>, c: AddonContext) => unknown)(withoutMeta(params), ctx);
}

const FALLBACK_DEADLINE_MS = 5 * 60_000;

function isCallMeta(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'correlationId' in value;
}

function fallbackMeta(correlationId: string, deadline: number): CallMeta {
  return {
    correlationId,
    deadline,
    principal: { type: 'system' },
    locale: 'en',
  };
}

function pairTarget(
  table: Record<string, { start?: unknown; stop?: unknown }> | undefined,
  key: string,
  phase: 'start' | 'stop',
  params: Record<string, unknown>,
  ctx: AddonContext,
): Target {
  const handler = table?.[key]?.[phase];
  if (typeof handler !== 'function') {
    return null;
  }
  return () => (handler as (p: unknown, c: AddonContext) => unknown)(params, ctx);
}

function optionalTarget(
  handler: unknown,
  params: Record<string, unknown>,
  ctx: AddonContext,
): Target {
  if (typeof handler !== 'function') {
    return null;
  }
  return () => (handler as (p: unknown, c: AddonContext) => unknown)(params, ctx);
}

async function runWithDeadline(
  work: unknown,
  deadline: number,
  now: () => number,
  signal: AbortSignal,
): Promise<unknown> {
  const remaining = deadline - now();
  if (remaining <= 0 || signal.aborted) {
    throw new AddonError(signal.aborted ? 'cancelled' : 'timeout');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new AddonError('timeout', { detail: `deadline ${deadline} exceeded` })),
      remaining,
    );
  });
  const abort = new Promise<never>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new AddonError('cancelled')), { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(work), timeout, abort]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export type { AddonErrorReason };
