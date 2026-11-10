import type { JsonRpcNotification, JsonRpcRequest } from '@harnesys/sdk';
import { decodeMessage, encodeMessage, errorResponse, request as rpcRequest } from '@harnesys/sdk';
import type { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';

export interface TransportRpcOptions {
  readonly transport: AddonTransportPort;
  handleRequest: (line: string, message: JsonRpcRequest) => Promise<string | null>;
  handleNotification: (line: string, message: JsonRpcNotification) => void;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface IdleWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const INTERNAL_ERROR_CODE = -32000;

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

  call<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
    this.nextId += 1;
    const id = this.nextId;
    const line = encodeMessage(rpcRequest(method, id, params));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`call ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.options.transport.send(line);
    });
  }

  notify(method: string, params: unknown): void {
    this.options.transport.send(encodeMessage({ jsonrpc: '2.0', method, params }));
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
    clearTimeout(entry.timer);
    this.pending.delete(parsed.id);
    if (parsed.error) {
      entry.reject(new Error(parsed.error.message));
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
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
