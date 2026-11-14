import type { Subprocess } from 'bun';

export interface StdioWritable {
  write(chunk: string): unknown;
  flush?(): unknown;
  end?(): unknown;
}

export type StdioReadable = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export interface SpawnedStdio {
  readonly stdin: StdioWritable;
  readonly stdout: StdioReadable;
  readonly stderr: StdioReadable;
}

export interface ChildHandle {
  readonly pid: number | undefined;
  readonly exited: Promise<number | null>;
  kill(signal: number): void;
  rssBytes(): number | null;
}

export interface AddonLogSink {
  write(orgId: string, addonId: string, line: string): void;
}

const SIGKILL = 9;

export class ProcessChildHandle implements ChildHandle {
  private readonly exitedPromise: Promise<number | null>;

  constructor(private readonly proc: Subprocess<'pipe', 'pipe', 'pipe'>) {
    this.exitedPromise = proc.exited.then((code) => code ?? null);
  }

  get pid(): number | undefined {
    return this.proc.pid;
  }

  get exited(): Promise<number | null> {
    return this.exitedPromise;
  }

  kill(signal: number): void {
    if (this.proc.exitCode === null) {
      this.proc.kill(signal);
    }
  }

  rssBytes(): number | null {
    try {
      const usage = this.proc.resourceUsage();
      if (!usage || !Number.isFinite(usage.maxRSS)) {
        return null;
      }
      return usage.maxRSS;
    } catch {
      return null;
    }
  }
}

export { SIGKILL };
