import type { JsonRpcNotification, JsonRpcRequest } from '@harnesys/sdk';
import {
  AddonErrorDataSchema,
  decodeMessage,
  encodeMessage,
  errorResponse,
  request as rpcRequest,
} from '@harnesys/sdk';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';

/** HTTP status for an addon-reported error reason (typed-error contract). */
function statusOfAddonReason(reason: string): number {
  switch (reason) {
    case 'invalid_params':
      return 400;
    case 'not_found':
      return 404;
    case 'permission_denied':
    case 'permission_revoked':
      return 403;
    case 'conflict':
    case 'account_failed':
      return 409;
    case 'quota_exceeded':
    case 'rate_limited':
      return 429;
    case 'timeout':
      return 504;
    case 'unavailable':
      return 503;
    case 'unsupported':
      return 501;
    case 'invalid_response':
      return 502;
    default:
      return 500;
  }
}

/**
 * Rebuilds a typed host exception from the addon's JSON-RPC error so the REST
 * filter can map reason and detail into the ErrorResponse contract instead of
 * collapsing every addon failure into 500 INTERNAL_ERROR.
 */
function addonRpcErrorOf(error: { message: string; data?: unknown }): Error {
  const data = AddonErrorDataSchema.safeParse(error.data);
  if (!data.success) {
    return new Error(error.message);
  }
  return new AddonException(
    data.data.reason,
    statusOfAddonReason(data.data.reason),
    data.data.detail ?? error.message,
    data.data,
  );
}

export interface TransportRpcOptions {
  readonly transport: AddonTransportPort;
  /** Locale stamped into params._meta (§6.3); defaults to 'en'. */
  readonly locale?: string;
  handleRequest: (line: string, message: JsonRpcRequest) => Promise<string | null>;
  handleNotification: (line: string, message: JsonRpcNotification) => void;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

interface IdleWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const INTERNAL_ERROR_CODE = -32000;
const NOTIFY_DEADLINE_MS = 30_000;

interface CallMetaStamp {
  correlationId: string;
  deadline: number | null;
  principal: { type: 'agent' | 'user' | 'system'; id?: string };
  locale: string;
  agentId?: string;
  threadId?: string;
  runId?: string;
}

export interface RpcCallMeta {
  principal?: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string;
  threadId?: string;
  runId?: string;
}

function isCallMeta(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'correlationId' in value;
}

/** Stamps params._meta (§6.3) unless the caller already supplied one. */
function withCallMeta(
  params: unknown,
  timeoutMs: number | null,
  locale: string,
  overrides?: RpcCallMeta,
): unknown {
  const base = (params ?? {}) as Record<string, unknown>;
  if (isCallMeta(base._meta)) {
    return base;
  }
  const meta: CallMetaStamp = {
    correlationId: crypto.randomUUID(),
    deadline: timeoutMs === null ? null : Date.now() + timeoutMs,
    principal: overrides?.principal ?? { type: 'system' },
    locale,
  };
  if (overrides?.agentId !== undefined) {
    meta.agentId = overrides.agentId;
  }
  if (overrides?.threadId !== undefined) {
    meta.threadId = overrides.threadId;
  }
  if (overrides?.runId !== undefined) {
    meta.runId = overrides.runId;
  }
  return { ...base, _meta: meta };
}

export class TransportRpcClient {
  private readonly pending = new Map<string | number, PendingEntry>();
  private readonly idleWaiters: IdleWaiter[] = [];
  private nextId = 0;
  private active = false;
  private unsubscribe: (() => void) | null = null;
  private droppedStaleMessages = 0;

  constructor(private readonly options: TransportRpcOptions) {}

  attach(): void {
    this.active = true;
    this.unsubscribe = this.options.transport.onMessage((message) => this.handleMessage(message));
  }

  detach(): void {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.rejectAllPending('instance transport detached');
    this.settleIdleWaiters();
  }

  call<T>(
    method: string,
    params: unknown,
    timeoutMs: number | null,
    meta?: RpcCallMeta,
  ): Promise<T> {
    this.nextId += 1;
    const id = this.nextId;
    const line = encodeMessage(
      rpcRequest(method, id, withCallMeta(params, timeoutMs, this.options.locale ?? 'en', meta)),
    );
    return new Promise<T>((resolve, reject) => {
      const entry: PendingEntry = { resolve: resolve as (value: unknown) => void, reject };
      if (timeoutMs !== null) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`call ${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this.options.transport.send(line);
    });
  }

  notify(method: string, params: unknown): void {
    this.options.transport.send(
      encodeMessage({
        jsonrpc: '2.0',
        method,
        params: withCallMeta(params, NOTIFY_DEADLINE_MS, this.options.locale ?? 'en'),
      }),
    );
  }

  waitIdle(deadlineMs: number): Promise<void> {
    if (this.pending.size === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`drain deadline of ${deadlineMs}ms exceeded`)),
        deadlineMs,
      );
      this.idleWaiters.push({ resolve, timer });
    });
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  get staleMessagesDropped(): number {
    return this.droppedStaleMessages;
  }

  private handleMessage(message: string): void {
    if (!this.active) {
      this.droppedStaleMessages += 1;
      return;
    }
    let parsed: ReturnType<typeof decodeMessage>;
    try {
      parsed = decodeMessage(message);
    } catch {
      return;
    }
    if ('method' in parsed && 'id' in parsed) {
      void this.handleIncomingRequest(message, parsed);
      return;
    }
    if ('method' in parsed) {
      this.options.handleNotification(message, parsed);
      return;
    }
    const entry = this.pending.get(parsed.id);
    if (!entry) {
      return;
    }
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
    }
    this.pending.delete(parsed.id);
    if (parsed.error) {
      entry.reject(addonRpcErrorOf(parsed.error));
    } else {
      entry.resolve(parsed.result);
    }
    this.settleIdleWaiters();
  }

  private async handleIncomingRequest(line: string, message: JsonRpcRequest): Promise<void> {
    try {
      const responseLine = await this.options.handleRequest(line, message);
      if (responseLine !== null) {
        this.options.transport.send(responseLine);
        return;
      }
      this.options.transport.send(
        encodeMessage(
          errorResponse(message.id, {
            code: INTERNAL_ERROR_CODE,
            message: 'request handler produced no response',
          }),
        ),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.options.transport.send(
        encodeMessage(errorResponse(message.id, { code: INTERNAL_ERROR_CODE, message: reason })),
      );
    }
  }

  private settleIdleWaiters(): void {
    if (this.pending.size !== 0) {
      return;
    }
    for (const waiter of this.idleWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
  }

  private rejectAllPending(reason: string): void {
    for (const entry of this.pending.values()) {
      if (entry.timer !== undefined) {
        clearTimeout(entry.timer);
      }
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
