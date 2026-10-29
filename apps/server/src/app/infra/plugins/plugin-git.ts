import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  PluginConflictException,
  PluginValidationException,
} from '../../domain/plugin/plugin.error.ts';

const PLUGIN_GIT_TIMEOUT_MS = 120_000;
const GITHUB_SHORTHAND_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface ClonePluginRequest {
  source: string;
  dest: string;
  ref?: string;
}

export interface PluginRevision {
  revision: string;
}

export interface UpdatePluginCheckoutRequest {
  path: string;
  ref?: string;
}

interface SpawnGitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function resolveGitSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    throw new PluginValidationException('source is required');
  }
  if (GITHUB_SHORTHAND_RE.test(trimmed)) {
    const withoutGit = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed;
    return `https://github.com/${withoutGit}.git`;
  }
  return trimmed;
}

export async function clonePlugin(request: ClonePluginRequest): Promise<PluginRevision> {
  const dest = request.dest;
  if (existsSync(dest)) {
    throw new PluginConflictException(`plugin path exists: ${dest}`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await runGit(dirname(dest), ['clone', '--depth', '1', '--', request.source, dest]);
  if (request.ref !== undefined && request.ref.length > 0) {
    assertGitRef(request.ref);
    await runGit(dest, ['fetch', '--depth', '1', 'origin', request.ref]);
    await runGit(dest, ['checkout', '--force', 'FETCH_HEAD']);
  }
  const revision = await runGit(dest, ['rev-parse', 'HEAD']);
  return { revision };
}

export function isMarketplaceJsonUrl(source: string): boolean {
  const trimmed = source.trim();
  return /^https?:\/\//i.test(trimmed) && /marketplace\.json(\?|$)/i.test(trimmed);
}

export function slugFromSource(source: string): string {
  const trimmed = source
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  if (GITHUB_SHORTHAND_RE.test(trimmed)) {
    return trimmed.replace(/\//g, '-').toLowerCase();
  }
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    const last = parts.at(-1)?.replace(/\.json$/i, '') ?? 'marketplace';
    const owner = parts.at(-2);
    if (owner && last) {
      return `${owner}-${last}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
    }
    return last.toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'marketplace';
  } catch {
    const segment = trimmed.split(/[/:]/).filter(Boolean).at(-1) ?? 'marketplace';
    return segment.toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  }
}

export async function updatePluginCheckout(
  request: UpdatePluginCheckoutRequest,
): Promise<PluginRevision> {
  const cwd = request.path;
  if (request.ref !== undefined) {
    assertGitRef(request.ref);
    await runGit(cwd, ['fetch', '--depth', '1', 'origin', request.ref]);
    await runGit(cwd, ['checkout', '--force', 'FETCH_HEAD']);
  } else {
    await runGit(cwd, ['fetch', '--depth', '1', 'origin']);
    await runGit(cwd, ['reset', '--hard', 'FETCH_HEAD']);
  }
  const revision = await runGit(cwd, ['rev-parse', 'HEAD']);
  return { revision };
}

export async function removePluginPath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

function assertGitRef(ref: string): void {
  if (ref.length === 0 || ref.startsWith('-') || ref.includes('\0') || ref.includes('\n')) {
    throw new PluginValidationException('invalid ref');
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const res = await spawnGit({ cwd, args });
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim();
    throw new Error(detail || `git ${args[0] ?? ''} failed (${res.code})`);
  }
  return res.stdout.trim();
}

async function spawnGit(request: {
  cwd: string;
  args: string[];
  timeoutMs?: number;
}): Promise<SpawnGitResult> {
  const timeoutMs = request.timeoutMs ?? PLUGIN_GIT_TIMEOUT_MS;
  let proc: ReturnType<typeof Bun.spawn> | undefined;
  try {
    proc = Bun.spawn(['git', ...request.args], {
      cwd: request.cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: 'echo',
      },
    });
  } catch (err) {
    const msg = String(err);
    if (/ENOENT|not found/i.test(msg)) {
      throw new Error('git not found');
    }
    throw err;
  }
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    try {
      proc?.kill();
    } catch {
      undefined;
    }
  }, timeoutMs);
  try {
    const stdoutStream =
      proc.stdout != null && typeof proc.stdout !== 'number'
        ? (proc.stdout as ReadableStream)
        : null;
    const stderrStream =
      proc.stderr != null && typeof proc.stderr !== 'number'
        ? (proc.stderr as ReadableStream)
        : null;
    const [stdout, stderr, code] = await Promise.all([
      stdoutStream ? new Response(stdoutStream).text() : '',
      stderrStream ? new Response(stderrStream).text() : '',
      proc.exited,
    ]);
    if (timedOut) {
      throw new Error('git timeout');
    }
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timeout);
  }
}
