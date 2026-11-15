import { describe, expect, test } from 'bun:test';
import { decodeMessage } from '@harnesys/sdk';
import { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';
import { TransportRpcClient } from './transport-rpc-client.ts';

class FakeTransport extends AddonTransportPort {
  readonly sent: string[] = [];
  private handler: ((message: string) => void) | null = null;

  override send(message: string): void {
    this.sent.push(message);
  }

  override onMessage(handler: (message: string) => void): () => void {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  override close(): void {}

  deliverFromAddon(message: string): void {
    this.handler?.(message);
  }
}

function firstSent(transport: FakeTransport): string {
  const line = transport.sent[0];
  if (line === undefined) {
    throw new Error('expected an outgoing request line on the transport');
  }
  return line;
}

function makeClient(transport: FakeTransport): TransportRpcClient {
  const client = new TransportRpcClient({
    transport,
    handleRequest: async () => null,
    handleNotification: () => {},
  });
  client.attach();
  return client;
}

describe('TransportRpcClient host-to-addon cancellation', () => {
  test('abort sends one $/cancel with the pending request id and rejects', async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    const controller = new AbortController();
    const pending = client.call('test.slow', {}, null, undefined, controller.signal);
    expect(transport.sent).toHaveLength(1);
    const request = decodeMessage(firstSent(transport));
    if (!('method' in request) || !('id' in request)) {
      throw new Error('expected a JSON-RPC request line');
    }
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(transport.sent).toHaveLength(2);
    const cancelLine = transport.sent[1];
    if (cancelLine === undefined) {
      throw new Error('expected an outgoing $/cancel line on the transport');
    }
    const cancel = decodeMessage(cancelLine);
    if (!('method' in cancel) || 'id' in cancel) {
      throw new Error('expected a JSON-RPC notification line');
    }
    expect(cancel.method).toBe('$/cancel');
    expect(cancel.params).toEqual({ id: request.id });
    client.detach();
  });

  test('normal completion sends no $/cancel', async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    const controller = new AbortController();
    const pending = client.call('test.echo', {}, null, undefined, controller.signal);
    const request = decodeMessage(firstSent(transport));
    if (!('method' in request) || !('id' in request)) {
      throw new Error('expected a JSON-RPC request line');
    }
    transport.deliverFromAddon(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'ok' }));
    await expect(pending).resolves.toBe('ok');
    controller.abort();
    expect(transport.sent).toHaveLength(1);
    client.detach();
  });

  test('already-aborted signal rejects before send without any traffic', async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    const controller = new AbortController();
    controller.abort();
    await expect(client.call('test.echo', {}, null, undefined, controller.signal)).rejects.toThrow(
      'aborted before send',
    );
    expect(transport.sent).toHaveLength(0);
    expect(client.pendingCount).toBe(0);
    client.detach();
  });

  test('late response for a cancelled id is dropped and does not resolve', async () => {
    const transport = new FakeTransport();
    const client = makeClient(transport);
    const controller = new AbortController();
    const pending = client.call('test.slow', {}, null, undefined, controller.signal);
    const request = decodeMessage(firstSent(transport));
    if (!('method' in request) || !('id' in request)) {
      throw new Error('expected a JSON-RPC request line');
    }
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    transport.deliverFromAddon(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: 'late' }));
    expect(client.pendingCount).toBe(0);
    client.detach();
  });
});
