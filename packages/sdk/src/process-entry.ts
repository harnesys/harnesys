import type { ResolvedAddonDefinition } from './define-addon.ts';
import type { HostChannel } from './host-client.ts';
import type { JsonRpcResponse } from './protocol/envelope.ts';
import {
  decodeMessage,
  encodeMessage,
  errorResponse,
  request,
  response,
} from './protocol/envelope.ts';
import { AddonError, type AddonErrorReason } from './protocol/error.ts';
import { type AddonRuntime, createAddonRuntime } from './runtime.ts';

export const PROTOCOL_PLATFORM = 1;

const ERROR_CODES: Partial<Record<AddonErrorReason, number>> = {
  invalid_params: -32602,
  unsupported: -32601,
  not_found: -32601,
};

export type StdioWiringStdin = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export interface StdioWiring {
  stdin: StdioWiringStdin;
  stdout: { write(chunk: string): unknown };
  stderr: { write(chunk: string): unknown };
}

function stdinSource(stdin: StdioWiringStdin): AsyncIterable<Uint8Array> {
  if ('values' in stdin && typeof stdin.values === 'function') {
    return stdin.values();
  }
  return stdin as AsyncIterable<Uint8Array>;
}

export interface StartAddonProcessOptions {
  definition: ResolvedAddonDefinition;
  addon: { id: string; version: string };
  wiring?: StdioWiring;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

export function createStdioChannel(
  wiring: StdioWiring,
): HostChannel & { resolveResponse(message: JsonRpcResponse): void } {
  let nextId = 0;
  const pending = new Map<string | number, PendingCall>();

  function write(line: string): void {
    wiring.stdout.write(line);
  }

  return {
    request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
      nextId += 1;
      const id = nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        signal?.addEventListener(
          'abort',
          () => {
            if (pending.has(id)) {
              pending.delete(id);
              reject(new AddonError('cancelled'));
            }
          },
          { once: true },
        );
        write(encodeMessage(request(method, id, params)));
      });
    },
    notify(method: string, params: unknown): void {
      write(encodeMessage({ jsonrpc: '2.0', method, params }));
    },
    resolveResponse(message: JsonRpcResponse): void {
      const call = pending.get(message.id);
      if (!call) {
        return;
      }
      pending.delete(message.id);
      if (message.error) {
        call.reject(new Error(message.error.message));
      } else {
        call.resolve(message.result);
      }
    },
  };
}

export async function startAddonProcess(options: StartAddonProcessOptions): Promise<void> {
  const wiring = options.wiring ?? {
    stdin: Bun.stdin.stream(),
    stdout: process.stdout,
    stderr: process.stderr,
  };
  const channel = createStdioChannel(wiring);
  const runtime: AddonRuntime = createAddonRuntime({
    definition: options.definition,
    addon: options.addon,
    channel,
  });
  const controllers = new Map<string | number, AbortController>();

  function reply(id: string | number, result: unknown): void {
    wiring.stdout.write(encodeMessage(response(id, result)));
  }

  function replyError(id: string | number | null, error: unknown): void {
    const data =
      error instanceof AddonError
        ? error.toData()
        : { reason: 'internal' as const, retryable: false };
    const reason: AddonErrorReason = data.reason;
    wiring.stdout.write(
      encodeMessage(
        errorResponse(id, { code: ERROR_CODES[reason] ?? -32000, message: reason, data }),
      ),
    );
  }

  function logFailure(scope: string, error: unknown): void {
    wiring.stderr.write(
      `addon ${scope} failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }

  async function handleLine(line: string): Promise<void> {
    const message = decodeMessage(line);
    if ('method' in message && 'id' in message) {
      await handleHostRequest(message.method, message.id, message.params);
      return;
    }
    if ('method' in message) {
      await handleHostNotification(message.method, message.params);
      return;
    }
    channel.resolveResponse(message);
  }

  async function handleHostRequest(
    method: string,
    id: string | number,
    params: unknown,
  ): Promise<void> {
    const controller = new AbortController();
    controllers.set(id, controller);
    try {
      const result =
        method === 'initialize'
          ? runtime.initialize(params as never)
          : await runtime.handleRequest(method, params, controller.signal);
      reply(id, result);
    } catch (error) {
      replyError(id, error);
    } finally {
      controllers.delete(id);
    }
  }

  async function handleHostNotification(method: string, params: unknown): Promise<void> {
    if (method === '$/cancel') {
      const cancelParams = (params ?? {}) as { id?: string | number };
      if (cancelParams.id !== undefined) {
        controllers.get(cancelParams.id)?.abort();
      }
      return;
    }
    try {
      await runtime.handleNotification(method, params, new AbortController().signal);
    } catch (error) {
      logFailure(`notification ${method}`, error);
    }
  }

  for await (const chunk of stdinSource(wiring.stdin)) {
    const text = new TextDecoder().decode(chunk);
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      void handleLine(trimmed).catch((error: unknown) => {
        replyError(null, error);
      });
    }
  }
}
