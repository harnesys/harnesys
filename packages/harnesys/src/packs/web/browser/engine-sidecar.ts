import { homedir } from 'node:os';
import { join } from 'node:path';

const socketHandler = {
  open(): void {},
  data(): void {},
  close(): void {},
  error(): void {},
};

export interface EngineSidecar {
  port: number;
  stop: () => Promise<void>;
}

export interface StartSidecarInput {
  binaryPath: string;
  engineId: string;
  stealth?: boolean;
  allowPrivateNetwork?: boolean;
  headed?: boolean;
}

const CHROMIUM_FAMILY = new Set(['chromium', 'chrome', 'edge', 'brave', 'vivaldi', 'opera']);

const READY_ATTEMPTS = 50;
const READY_DELAY_MS = 200;

export async function freePort(): Promise<number> {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: socketHandler });
  const port = listener.port;
  listener.stop(true);
  return port;
}

function chromiumArgs(input: StartSidecarInput, port: number): string[] {
  const profile =
    input.headed === true
      ? join(homedir(), '.harnesys', 'browser-profiles', input.engineId)
      : join('/tmp', 'harnesys-browser', `profile-${port}`);
  return [
    ...(input.headed === true ? [] : ['--headless=new']),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

function serveArgs(input: StartSidecarInput, port: number): string[] {
  if (input.engineId === 'obscura') {
    return [
      'serve',
      '--port',
      String(port),
      ...(input.stealth === true ? ['--stealth'] : []),
      ...(input.allowPrivateNetwork === true ? ['--allow-private-network'] : []),
    ];
  }
  if (CHROMIUM_FAMILY.has(input.engineId)) {
    return chromiumArgs(input, port);
  }
  return ['serve', '--port', String(port)];
}

export async function startEngineSidecar(input: StartSidecarInput): Promise<EngineSidecar> {
  const port = await freePort();
  const proc = Bun.spawn([input.binaryPath, ...serveArgs(input, port)], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
  });
  const ready = await waitForPort(port);
  if (!ready) {
    const stderr = await new Response(proc.stderr as ReadableStream).text();
    proc.kill();
    await proc.exited;
    throw new Error(
      `engine sidecar ${input.engineId} did not open port ${port}: ${stderr.slice(-400)}`,
    );
  }
  return {
    port,
    stop: async () => {
      proc.kill();
      await proc.exited.catch(() => {});
    },
  };
}

async function waitForPort(port: number): Promise<boolean> {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    const open = await probeTcp(port);
    if (open) {
      return true;
    }
    await Bun.sleep(READY_DELAY_MS);
  }
  return false;
}

async function probeTcp(port: number): Promise<boolean> {
  try {
    const conn = await Bun.connect({
      hostname: '127.0.0.1',
      port,
      socket: socketHandler,
    });
    conn.end();
    return true;
  } catch {
    return false;
  }
}

interface PoolEntry {
  sidecar: EngineSidecar;
  idleTimer: ReturnType<typeof setTimeout>;
}

const DEFAULT_IDLE_TTL_MS = 600_000;
const pool = new Map<string, PoolEntry>();

export interface AcquireSidecarInput extends StartSidecarInput {
  key: string;
  idleTtlMs?: number;
}

export async function acquireEngineSidecar(input: AcquireSidecarInput): Promise<EngineSidecar> {
  const existing = pool.get(input.key);
  if (existing !== undefined) {
    resetIdleTimer(input.key, input.idleTtlMs ?? DEFAULT_IDLE_TTL_MS);
    return existing.sidecar;
  }
  const sidecar = await startEngineSidecar(input);
  pool.set(input.key, {
    sidecar,
    idleTimer: scheduleIdle(input.key, input.idleTtlMs ?? DEFAULT_IDLE_TTL_MS),
  });
  return sidecar;
}

function scheduleIdle(key: string, ttlMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    void releaseEngineSidecar(key);
  }, ttlMs);
}

function resetIdleTimer(key: string, ttlMs: number): void {
  const entry = pool.get(key);
  if (entry === undefined) {
    return;
  }
  clearTimeout(entry.idleTimer);
  entry.idleTimer = scheduleIdle(key, ttlMs);
}

export async function releaseEngineSidecar(key: string): Promise<void> {
  const entry = pool.get(key);
  if (entry === undefined) {
    return;
  }
  pool.delete(key);
  clearTimeout(entry.idleTimer);
  await entry.sidecar.stop();
}
