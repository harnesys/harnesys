import type { Dirent } from 'node:fs';
import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises';
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
  egressProxyPort?: number;
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

const ROOT_UID = 0;

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
    '--disable-dev-shm-usage',
    ...(input.egressProxyPort !== undefined
      ? [
          `--proxy-server=http://127.0.0.1:${input.egressProxyPort}`,
          '--proxy-bypass-list=<-loopback>',
          '--disable-quic',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ]
      : []),
    ...(process.getuid?.() === ROOT_UID ? ['--no-sandbox'] : []),
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
      ...(input.egressProxyPort !== undefined
        ? ['--proxy', `http://127.0.0.1:${input.egressProxyPort}`]
        : []),
    ];
  }
  if (CHROMIUM_FAMILY.has(input.engineId)) {
    return chromiumArgs(input, port);
  }
  return ['serve', '--port', String(port)];
}

const PROXY_ENV_KEYS = [
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'no_proxy',
] as const;

function sidecarEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !PROXY_ENV_KEYS.includes(key as (typeof PROXY_ENV_KEYS)[number])) {
      env[key] = value;
    }
  }
  return env;
}

export async function startEngineSidecar(input: StartSidecarInput): Promise<EngineSidecar> {
  const port = await freePort();
  const profileDir = ephemeralProfileDir(input, port);
  if (profileDir !== undefined) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
    await mkdir(profileDir, { recursive: true, mode: 0o700 }).catch(() => {});
    await chmod(profileDir, 0o700).catch(() => {});
  }
  const proc = Bun.spawn([input.binaryPath, ...serveArgs(input, port)], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    env: sidecarEnv(),
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
      if (profileDir !== undefined) {
        await rm(profileDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  };
}

const EPHEMERAL_PROFILE_ROOT = join('/tmp', 'harnesys-browser');

function ephemeralProfileDir(input: StartSidecarInput, port: number): string | undefined {
  if (input.headed === true) {
    return undefined;
  }
  return join(EPHEMERAL_PROFILE_ROOT, `profile-${port}`);
}

const STALE_PROFILE_AGE_MS = 24 * 60 * 60 * 1000;

export async function sweepStaleProfiles(): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(EPHEMERAL_PROFILE_ROOT, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('profile-')) {
      continue;
    }
    const path = join(EPHEMERAL_PROFILE_ROOT, entry.name);
    try {
      const stats = await stat(path);
      if (Date.now() - stats.mtimeMs > STALE_PROFILE_AGE_MS) {
        await rm(path, { recursive: true, force: true }).catch(() => {});
      }
    } catch {}
  }
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
  egressProxyPort?: number;
  onRelease?: () => Promise<void> | void;
}

const DEFAULT_IDLE_TTL_MS = 600_000;
const pool = new Map<string, PoolEntry>();

export interface AcquireSidecarInput extends StartSidecarInput {
  key: string;
  idleTtlMs?: number;
  onRelease?: () => Promise<void> | void;
}

export async function acquireEngineSidecar(input: AcquireSidecarInput): Promise<EngineSidecar> {
  if (pool.size === 0) {
    void sweepStaleProfiles();
  }
  const existing = pool.get(input.key);
  if (existing !== undefined) {
    if (existing.egressProxyPort === input.egressProxyPort) {
      resetIdleTimer(input.key, input.idleTtlMs ?? DEFAULT_IDLE_TTL_MS);
      return existing.sidecar;
    }
    await releaseEngineSidecar(input.key);
  }
  const sidecar = await startEngineSidecar(input);
  pool.set(input.key, {
    sidecar,
    idleTimer: scheduleIdle(input.key, input.idleTtlMs ?? DEFAULT_IDLE_TTL_MS),
    ...(input.egressProxyPort !== undefined ? { egressProxyPort: input.egressProxyPort } : {}),
    onRelease: input.onRelease,
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
  try {
    await entry.onRelease?.();
  } catch {
    return;
  }
}
