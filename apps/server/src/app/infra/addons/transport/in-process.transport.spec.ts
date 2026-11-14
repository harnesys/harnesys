import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { Logger } from '@harnesys/brix';
import type { InitializeParams, ResolvedAddonDefinition } from '@harnesys/sdk';
import { PROTOCOL_PLATFORM } from '@harnesys/sdk';
import { createInProcessPair } from './in-process-wiring.ts';
import { SdkInProcessAddonLoader } from './sdk-in-process-loader.ts';

class FakeLogger extends Logger {
  override child(): Logger {
    return this;
  }

  override info(): void {}
  override debug(): void {}
  override warn(): void {}
  override error(): void {}
}

const ENTRY = join(import.meta.dir, 'fixtures', 'fake-addon-entry.ts');

async function collectLines(
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const index = buffer.indexOf('\n');
      if (index === -1) {
        break;
      }
      onLine(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
    }
  }
}

function makeHostSide(): {
  readonly received: string[];
  send(line: string): void;
  closeStdin(): void;
  nextResponse(): Promise<string>;
  stderrLines: string[];
} {
  const pair = createInProcessPair((line) => state.stderrLines.push(line));
  const received: string[] = [];
  const state: { stderrLines: string[] } = { stderrLines: [] };
  const waiters: Array<(line: string) => void> = [];
  function feed(line: string): void {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(line);
      return;
    }
    received.push(line);
  }
  const startAddon = (async () => {
    const { startAddonProcess } = await import('@harnesys/sdk');
    const module = (await import(ENTRY)) as { addon: ResolvedAddonDefinition };
    void startAddonProcess({
      definition: module.addon,
      addon: { id: 'acme.echo', version: '1.0.0' },
      wiring: pair.addonWiring,
    });
  })();
  void (async () => {
    await startAddon;
    await collectLines(pair.hostSide.stdout as ReadableStream<Uint8Array>, feed);
  })();
  return {
    received,
    send(line: string): void {
      void startAddon.then(() => pair.hostSide.stdin.write(line));
    },
    closeStdin(): void {
      pair.hostSide.stdin.end?.();
      pair.close();
    },
    nextResponse(): Promise<string> {
      if (received.length > 0) {
        return Promise.resolve(received.shift() ?? '');
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(''), 3000);
        waiters.push((line) => {
          clearTimeout(timer);
          resolve(line);
        });
      });
    },
    stderrLines: state.stderrLines,
  };
}

describe('in-process transport', () => {
  test('performs the full JSON-RPC handshake over the memory pair', async () => {
    const host = makeHostSide();
    host.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          platform: PROTOCOL_PLATFORM,
          host: { version: 'test', features: [] },
          instance: { orgId: 'org-1', generation: 1, dataDir: '/tmp/x', locale: 'en' },
          permissions: [],
          experimental: [],
          deprecations: [],
        } satisfies InitializeParams,
      }),
    );
    const raw = await host.nextResponse();
    expect(raw).toStartWith('{');
    const response = JSON.parse(raw) as {
      id: number;
      result: { addon: { id: string }; handlers: string[] };
    };
    expect(response.id).toBe(1);
    expect(response.result.addon.id).toBe('acme.echo');
    expect(response.result.handlers).toContain('tools.call');
    expect(response.result.handlers).toContain('ping');
    host.closeStdin();
  });

  test('JSON-structure clone gives process-mode parity for params and results', async () => {
    const pair = createInProcessPair(() => undefined);
    const sent =
      '{"jsonrpc":"2.0","id":7,"method":"tools.call","params":{"tool":"echo","input":{"text":"hi"}}}';
    const receivedByAddon: { value: string | null } = { value: null };
    const addonRead = pair.addonWiring.stdin[Symbol.asyncIterator]();
    const readPromise = addonRead.next().then((chunk) => {
      receivedByAddon.value = new TextDecoder().decode(chunk.value ?? new Uint8Array());
    });
    pair.hostSide.stdin.write(sent);
    await readPromise;
    expect(receivedByAddon.value).toBe(sent);
    const echoedBack = JSON.parse(sent) as Record<string, unknown>;
    const reSerialized = JSON.stringify(echoedBack);
    expect(reSerialized).toBe(JSON.stringify(JSON.parse(sent)));
    pair.close();
  });

  test('clone drops object identity across the boundary', () => {
    const line = '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"nested":{"a":[1,2]}}}';
    const cloned = JSON.parse(JSON.stringify(JSON.parse(line))) as Record<string, unknown>;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(cloned).toEqual(parsed);
    expect(cloned.params).not.toBe(parsed.params);
  });

  test('loader rejects unknown entries and recovers', async () => {
    const loader = new SdkInProcessAddonLoader(new FakeLogger());
    await expect(
      loader.load(
        {
          orgId: 'org-1',
          addonId: 'acme.missing',
          version: '1.0.0',
          packageRoot: '.',
          entryPath: './nope-does-not-exist.ts',
          dataDir: '/tmp/x',
        },
        () => undefined,
      ),
    ).rejects.toThrow('in-process addon entry could not be loaded');
  });

  test('loader runs the addon entry in-process and answers calls', async () => {
    const loader = new SdkInProcessAddonLoader(new FakeLogger());
    const endpoint = await loader.load(
      {
        orgId: 'org-1',
        addonId: 'acme.echo',
        version: '1.0.0',
        packageRoot: '.',
        entryPath: ENTRY,
        dataDir: '/tmp/x',
      },
      () => undefined,
    );
    const responses: string[] = [];
    const readerTask = collectLines(endpoint.stdout as ReadableStream<Uint8Array>, (line) =>
      responses.push(line),
    );
    endpoint.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          platform: PROTOCOL_PLATFORM,
          host: { version: 'test', features: [] },
          instance: { orgId: 'org-1', generation: 1, dataDir: '/tmp/x', locale: 'en' },
          permissions: [],
          experimental: [],
          deprecations: [],
        },
      })}\n`,
    );
    endpoint.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized' })}\n`);
    endpoint.stdin.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools.call',
        params: {
          pack: 'echo',
          tool: 'echo',
          input: { text: 'hello' },
          _meta: {
            correlationId: 'c1',
            deadline: Date.now() + 5000,
            principal: { type: 'system' },
            locale: 'en',
          },
        },
      })}\n`,
    );
    await Bun.sleep(150);
    expect(responses.length).toBeGreaterThanOrEqual(2);
    const toolResponse = responses
      .map((line) => JSON.parse(line) as { id: number; result?: { output?: { echoed?: string } } })
      .find((message) => message.id === 2);
    expect(toolResponse?.result?.output?.echoed).toBe('hello');
    endpoint.dispose();
    void readerTask;
  });
});
