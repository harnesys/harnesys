import type { AddonLogLevel, AddonLogLine } from '@harnesys/contracts';
import type { Subprocess } from 'bun';
import {
  ADDON_ENV_DATA_DIR,
  ADDON_ENV_ENTRY,
  ADDON_ENV_ID,
  ADDON_ENV_VERSION,
  ADDON_SDK_PROCESS_ENTRY,
} from './addon-paths.ts';

export interface AddonWorkerOptions {
  readonly orgId: string;
  readonly addonId: string;
  readonly version: string;
  readonly root: string;
  readonly entryPath: string;
  readonly dataDir: string;
  readonly onLog: (line: AddonLogLine) => void;
  readonly onExit: (addonId: string, code: number | null) => void;
}

export interface AddonRegisterResult {
  readonly contributions: readonly {
    readonly id: string;
    readonly family: string;
    readonly descriptor: Record<string, unknown>;
  }[];
}

const SHUTDOWN_GRACE_MS = 2_000;

export class AddonWorker {
  private proc: Subprocess | undefined;
  private seq = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private closed = false;
  private logSeq = 0;

  constructor(private readonly options: AddonWorkerOptions) {}

  get alive(): boolean {
    return this.proc !== undefined && !this.closed && this.proc.exitCode === null;
  }

  async start(): Promise<AddonRegisterResult> {
    const proc = Bun.spawn(['bun', ADDON_SDK_PROCESS_ENTRY], {
      cwd: this.options.root,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: addonEnv(this.options),
    });
    this.proc = proc;
    void this.readStdout(proc);
    void this.readStderr(proc);
    void proc.exited.then((code) => {
      this.closed = true;
      this.failPending(new Error(`addon process exited with code ${code}`));
      this.options.onExit(this.options.addonId, code);
    });

    const result = await this.request<AddonRegisterResult>('register', {
      addonId: this.options.addonId,
      version: this.options.version,
      orgId: this.options.orgId,
      dataDir: this.options.dataDir,
      secretKeys: [],
    });
    return result;
  }

  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return await this.request<T>(method, params);
  }

  ping(): Promise<boolean> {
    return this.request<boolean>('config.get', {});
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc || this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.request('shutdown', {});
    } catch {
      proc.kill();
    }
    const timer = setTimeout(() => proc.kill(SIGKILL), SHUTDOWN_GRACE_MS);
    await proc.exited;
    clearTimeout(timer);
    this.failPending(new Error('addon worker stopped'));
  }

  private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const proc = this.proc;
    if (!proc || !this.alive) {
      return Promise.reject(new Error(`addon worker not running: ${this.options.addonId}`));
    }
    const id = ++this.seq;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      const stdin = proc.stdin;
      if (!stdin || typeof stdin === 'number') {
        this.reject(id, new Error('addon stdin is not writable'));
        return;
      }
      void (async () => {
        await stdin.write(`${payload}\n`);
        await stdin.flush();
      })().catch((error: unknown) => this.reject(id, error));
    });
  }

  private reject(id: number, error: unknown): void {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    this.pending.delete(id);
    entry.reject(error instanceof Error ? error : new Error(String(error)));
  }

  private failPending(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  private async readStdout(proc: Subprocess): Promise<void> {
    const stdout = proc.stdout;
    if (stdout == null || typeof stdout === 'number') {
      return;
    }
    const reader = stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
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
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) {
            this.handleStdoutLine(line);
          }
        }
      }
    } catch {
      return;
    }
  }

  private handleStdoutLine(line: string): void {
    let message: {
      id?: number | string;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: Record<string, unknown>;
    };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const entry = this.pending.get(message.id);
      if (entry) {
        this.pending.delete(message.id);
        if (message.error) {
          entry.reject(new Error(message.error.message));
        } else {
          entry.resolve(message.result);
        }
      }
      return;
    }
    if (message.method === 'log' && message.params) {
      this.emitLog(message.params);
    }
  }

  private emitLog(params: Record<string, unknown>): void {
    const level = normalizeLevel(params.level);
    const message = typeof params.message === 'string' ? params.message : '';
    this.logSeq += 1;
    this.options.onLog({
      seq: this.logSeq,
      at: new Date().toISOString(),
      level,
      message,
      fields: asRecord(params.fields),
    });
  }

  private async readStderr(proc: Subprocess): Promise<void> {
    const stderr = proc.stderr;
    if (stderr == null || typeof stderr === 'number') {
      return;
    }
    const text = await new Response(stderr).text();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    this.logSeq += 1;
    this.options.onLog({
      seq: this.logSeq,
      at: new Date().toISOString(),
      level: 'error',
      message: trimmed,
      fields: { stream: 'stderr' },
    });
  }
}

const SIGKILL = 9;

function addonEnv(options: AddonWorkerOptions): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  env[ADDON_ENV_ID] = options.addonId;
  env[ADDON_ENV_VERSION] = options.version;
  env[ADDON_ENV_ENTRY] = options.entryPath;
  env[ADDON_ENV_DATA_DIR] = options.dataDir;
  return env;
}

function normalizeLevel(value: unknown): AddonLogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  return 'info';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
