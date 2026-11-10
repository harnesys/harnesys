import type { StdioWiring } from '@harnesys/sdk';
import type { SpawnedStdio } from './stdio-wiring.ts';

export interface InProcessPair {
  readonly hostSide: SpawnedStdio;
  readonly addonWiring: StdioWiring;
  close(): void;
}

class ClonedStringPipe {
  private readonly controllerHolder: {
    controller: ReadableStreamDefaultController<Uint8Array> | null;
  } = {
    controller: null,
  };
  private readonly encoder = new TextEncoder();
  private closed = false;
  private readonly stream: ReadableStream<Uint8Array>;

  constructor() {
    const holder = this.controllerHolder;
    this.stream = new ReadableStream<Uint8Array>({
      start(controller) {
        holder.controller = controller;
      },
      cancel() {
        holder.controller = null;
      },
    });
  }

  push(line: string): void {
    if (this.closed) {
      return;
    }
    const controller = this.controllerHolder.controller;
    if (!controller) {
      return;
    }
    try {
      controller.enqueue(this.encoder.encode(line));
    } catch {
      this.closed = true;
    }
  }

  end(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const controller = this.controllerHolder.controller;
    if (controller) {
      try {
        controller.close();
      } catch {
        this.controllerHolder.controller = null;
      }
    }
  }

  get readable(): ReadableStream<Uint8Array> {
    return this.stream;
  }
}

function cloneLine(line: string): string {
  const hadNewline = line.endsWith('\n');
  const body = hadNewline ? line.slice(0, -1) : line;
  const cloned = JSON.stringify(JSON.parse(body));
  return hadNewline ? `${cloned}\n` : cloned;
}

export function createInProcessPair(onAddonStderr: (line: string) => void): InProcessPair {
  const hostToAddon = new ClonedStringPipe();
  const addonToHost = new ClonedStringPipe();

  const hostSide: SpawnedStdio = {
    stdin: {
      write(chunk: string): unknown {
        hostToAddon.push(cloneLine(chunk));
        return chunk.length;
      },
      end(): unknown {
        hostToAddon.end();
        return undefined;
      },
    },
    stdout: addonToHost.readable,
    stderr: new ReadableStream<Uint8Array>({ start() {} }),
  };

  const addonWiring: StdioWiring = {
    stdin: hostToAddon.readable,
    stdout: {
      write(chunk: string): unknown {
        addonToHost.push(cloneLine(chunk));
        return chunk.length;
      },
    },
    stderr: {
      write(chunk: string): unknown {
        onAddonStderr(chunk);
        return chunk.length;
      },
    },
  };

  return {
    hostSide,
    addonWiring,
    close(): void {
      hostToAddon.end();
      addonToHost.end();
    },
  };
}
