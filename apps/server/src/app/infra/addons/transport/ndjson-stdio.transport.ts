import { MAX_MESSAGE_BYTES } from '@harnesys/sdk';
import { AddonTransportPort } from '../../../domain/addons/ports/addon-transport.port.ts';
import type { SpawnedStdio } from './stdio-wiring.ts';

export interface NdjsonStdioTransportOptions {
  readonly stdio: SpawnedStdio;
  readonly label: string;
  readonly onStderr: (line: string) => void;
  readonly onOversize: (bytes: number) => void;
}

export class NdjsonStdioTransport extends AddonTransportPort {
  private handler: ((message: string) => void) | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private readerStarted = false;
  private stderrStarted = false;
  private readonly encoder = new TextEncoder();

  constructor(private readonly options: NdjsonStdioTransportOptions) {
    super();
    this.startReaders();
  }

  send(message: string): void {
    if (this.closed) {
      return;
    }
    this.writeQueue = this.writeQueue.then(async () => {
      const stdin = this.options.stdio.stdin;
      await stdin.write(`${message}\n`);
      stdin.flush?.();
    });
    void this.writeQueue.catch(() => this.close());
  }

  onMessage(handler: (message: string) => void): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.options.stdio.stdin.end?.();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  private startReaders(): void {
    if (!this.readerStarted) {
      this.readerStarted = true;
      void this.readStream(this.options.stdio.stdout, (line) => this.handler?.(line));
    }
    if (!this.stderrStarted) {
      this.stderrStarted = true;
      void this.readStream(this.options.stdio.stderr, (line) => this.options.onStderr(line));
    }
  }

  private async readStream(
    stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
    onLine: (line: string) => void,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = '';
    const iterable = stream as AsyncIterable<Uint8Array>;
    try {
      for await (const chunk of iterable) {
        if (this.closed) {
          return;
        }
        buffer += decoder.decode(chunk, { stream: true });
        for (;;) {
          const index = buffer.indexOf('\n');
          if (index === -1) {
            break;
          }
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          this.handleLine(line, onLine);
        }
      }
      buffer += decoder.decode();
      if (buffer.length > 0 && !this.closed) {
        this.handleLine(buffer, onLine);
      }
    } catch {
      this.close();
    }
  }

  private handleLine(line: string, onLine: (line: string) => void): void {
    const trimmed = line.replace(/\r$/, '');
    if (trimmed.length === 0) {
      return;
    }
    const bytes = this.encoder.encode(trimmed).length;
    if (bytes > MAX_MESSAGE_BYTES) {
      this.options.onOversize(bytes);
      this.close();
      return;
    }
    onLine(trimmed);
  }
}
