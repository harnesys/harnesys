import { randomUUID } from 'node:crypto';
import type { ProxyHttpRequest, ProxyHttpResult } from '../../domain/fleet/fleet-hub.port.ts';

interface Pending {
  resolve(result: ProxyHttpResult): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class ProxyRequestTracker {
  private readonly pending = new Map<string, Pending>();

  request(
    lookupSend: () => ((data: string) => void) | undefined,
    input: ProxyHttpRequest,
    timeoutMs: number,
  ): Promise<ProxyHttpResult> {
    const send = lookupSend();
    if (!send) {
      return Promise.reject(new Error('proxy_offline'));
    }
    const requestId = randomUUID();
    return new Promise<ProxyHttpResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('proxy_timeout'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        send(
          JSON.stringify({
            kind: 'COMMAND',
            commandId: randomUUID(),
            command: {
              type: 'HTTP_PROXY',
              requestId,
              method: input.method,
              path: input.path,
              ...(input.body == null ? {} : { body: input.body }),
              ...(input.contentType == null ? {} : { contentType: input.contentType }),
            },
          }),
        );
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(err instanceof Error ? err : new Error('proxy_failed'));
      }
    });
  }

  resolve(requestId: string, result: ProxyHttpResult): void {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return;
    }
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(result);
  }

  failAll(err: Error): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }
}
