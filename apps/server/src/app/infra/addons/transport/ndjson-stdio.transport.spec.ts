import { describe, expect, test } from 'bun:test';
import { NdjsonStdioTransport } from './ndjson-stdio.transport.ts';
import type { SpawnedStdio } from './stdio-wiring.ts';

const OVERSIZE_LINE = 'x'.repeat(8 * 1024 * 1024 + 16);

interface Harness {
  transport: NdjsonStdioTransport;
  readonly sentToAddon: string[];
  pushFromAddon(chunk: string): void;
  pushStderr(chunk: string): void;
  endStdout(): void;
  readonly stderrLines: string[];
  stdinClosed: () => boolean;
}

function makeHarness(): Harness {
  const sentToAddon: string[] = [];
  let stdinClosed = false;
  const stderrLines: string[] = [];
  const stdoutController: { controller: ReadableStreamDefaultController<Uint8Array> | null } = {
    controller: null,
  };
  const stderrHolder: { controller: ReadableStreamDefaultController<Uint8Array> | null } = {
    controller: null,
  };
  const encoder = new TextEncoder();
  const stdout = new ReadableStream<Uint8Array>({
    start(controller) {
      stdoutController.controller = controller;
    },
  });
  const stderrStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stderrHolder.controller = controller;
    },
  });
  const stdio: SpawnedStdio = {
    stdin: {
      write(chunk: string): unknown {
        sentToAddon.push(chunk);
        return chunk.length;
      },
      end(): unknown {
        stdinClosed = true;
        return undefined;
      },
    },
    stdout,
    stderr: stderrStream,
  };
  const transport = new NdjsonStdioTransport({
    stdio,
    label: 'test',
    onStderr: (line) => stderrLines.push(line),
    onOversize: () => stderrLines.push('OVERSIZE'),
  });
  return {
    transport,
    sentToAddon,
    pushFromAddon: (chunk) => stdoutController.controller?.enqueue(encoder.encode(chunk)),
    pushStderr: (chunk) => stderrHolder.controller?.enqueue(encoder.encode(chunk)),
    endStdout: () => stdoutController.controller?.close(),
    stderrLines,
    stdinClosed: () => stdinClosed,
  };
}

async function nextMessages(transport: NdjsonStdioTransport, count: number): Promise<string[]> {
  const received: string[] = [];
  return await new Promise((resolve) => {
    const unsubscribe = transport.onMessage((message) => {
      received.push(message);
      if (received.length >= count) {
        unsubscribe();
        resolve(received);
      }
    });
  });
}

describe('NdjsonStdioTransport', () => {
  test('sends messages as newline-framed JSON lines in order', async () => {
    const harness = makeHarness();
    harness.transport.send('{"a":1}');
    harness.transport.send('{"b":2}');
    harness.transport.send('{"c":3}');
    await Bun.sleep(10);
    expect(harness.sentToAddon).toEqual(['{"a":1}\n', '{"b":2}\n', '{"c":3}\n']);
    expect(harness.stdinClosed()).toBe(false);
  });

  test('dispatches received lines to the message handler', async () => {
    const harness = makeHarness();
    const received = nextMessages(harness.transport, 2);
    harness.pushFromAddon('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    harness.pushFromAddon('{"jsonrpc":"2.0","id":2,"method":"ping"}\n');
    expect(await received).toEqual([
      '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      '{"jsonrpc":"2.0","id":2,"method":"ping"}',
    ]);
  });

  test('splits buffered chunks containing multiple lines', async () => {
    const harness = makeHarness();
    const received = nextMessages(harness.transport, 3);
    harness.pushFromAddon('{"id":1}\n{"id":2}\n{"id":3}\n');
    expect((await received).length).toBe(3);
  });

  test('holds partial lines until the newline arrives', async () => {
    const harness = makeHarness();
    const got: { value: string | null } = { value: null };
    harness.transport.onMessage((message) => {
      got.value = message;
    });
    harness.pushFromAddon('{"par');
    await Bun.sleep(10);
    expect(got.value).toBeNull();
    harness.pushFromAddon('tial":true}\n');
    await Bun.sleep(10);
    expect(got.value).toBe('{"partial":true}');
  });

  test('closes stdin and stops dispatch after close', async () => {
    const harness = makeHarness();
    harness.transport.close();
    harness.transport.send('{"late":true}');
    await Bun.sleep(10);
    expect(harness.stdinClosed()).toBe(true);
    expect(harness.sentToAddon).toEqual([]);
  });

  test('ignores empty lines and carriage returns', async () => {
    const harness = makeHarness();
    const received = nextMessages(harness.transport, 1);
    harness.pushFromAddon('\n\r\n{"id":9}\r\n\n');
    expect(await received).toEqual(['{"id":9}']);
  });

  test('pipes stderr lines to the log sink', async () => {
    const harness = makeHarness();
    harness.pushStderr('addon boot failed\n');
    harness.pushStderr('second line\n');
    await Bun.sleep(10);
    expect(harness.stderrLines).toEqual(['addon boot failed', 'second line']);
  });

  test('closes the transport on an over-cap message', async () => {
    const harness = makeHarness();
    harness.transport.onMessage(() => {});
    harness.pushFromAddon(`${OVERSIZE_LINE}\n{"after":1}\n`);
    await Bun.sleep(20);
    expect(harness.stderrLines).toContain('OVERSIZE');
    expect(harness.stdinClosed()).toBe(true);
  });
});
