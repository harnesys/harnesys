import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { EngineSpec } from './engine-catalog.ts';

export interface SystemEngineHit {
  binaryPath: string;
  version: string;
}

const VERSION_TIMEOUT_MS = 5_000;
const UNKNOWN_VERSION = 'system';

interface VersionCacheEntry {
  mtimeMs: number;
  version: string;
}

const versionCache = new Map<string, VersionCacheEntry>();

function macBinaryOf(appPath: string): string {
  const stem = basename(appPath).replace(/\.app$/, '');
  return join(appPath, 'Contents', 'MacOS', stem);
}

function macCandidates(appName: string): string[] {
  return [join('/Applications', appName), join(homedir(), 'Applications', appName)];
}

function linuxCandidate(bin: string): string | null {
  if (bin.startsWith('/')) {
    return existsSync(bin) ? bin : null;
  }
  return Bun.which(bin);
}

function parseVersion(output: string): string | null {
  const match = /\d+(?:\.\d+)+/.exec(output);
  return match === null ? null : match[0];
}

async function probeVersion(binaryPath: string): Promise<string> {
  let mtimeMs = 0;
  try {
    mtimeMs = (await stat(binaryPath)).mtimeMs;
  } catch {
    mtimeMs = 0;
  }
  const cached = versionCache.get(binaryPath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs) {
    return cached.version;
  }
  let version = UNKNOWN_VERSION;
  try {
    const proc = Bun.spawn([binaryPath, '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });
    const timer = setTimeout(() => proc.kill(), VERSION_TIMEOUT_MS);
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (code === 0) {
      version = parseVersion(`${stdout}\n${stderr}`) ?? UNKNOWN_VERSION;
    }
  } catch {
    version = UNKNOWN_VERSION;
  }
  versionCache.set(binaryPath, { mtimeMs, version });
  return version;
}

interface SystemDetector {
  macosApps: readonly string[];
  linuxBins: readonly string[];
}

function collectCandidates(detect: SystemDetector): string[] {
  if (process.platform === 'darwin') {
    const candidates: string[] = [];
    for (const app of detect.macosApps) {
      for (const appPath of macCandidates(app)) {
        if (existsSync(appPath)) {
          candidates.push(macBinaryOf(appPath));
        }
      }
    }
    return candidates;
  }
  const candidates: string[] = [];
  for (const bin of detect.linuxBins) {
    const resolved = linuxCandidate(bin);
    if (resolved !== null) {
      candidates.push(resolved);
    }
  }
  return candidates;
}

export async function detectSystemEngine(spec: EngineSpec): Promise<SystemEngineHit | null> {
  const detect = spec.system;
  if (detect === undefined) {
    return null;
  }
  for (const binaryPath of collectCandidates(detect)) {
    if (!existsSync(binaryPath)) {
      continue;
    }
    return { binaryPath, version: await probeVersion(binaryPath) };
  }
  return null;
}
