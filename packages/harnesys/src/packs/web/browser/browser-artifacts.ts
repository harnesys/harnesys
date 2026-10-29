import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';

export const BROWSER_ARTIFACT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function browserArtifactsDir(session: string): string {
  return join(homedir(), '.harnesys', 'browser-artifacts', session);
}

function defaultArtifactName(command: string, nowMs: number): string {
  return `${command}-${nowMs}.${command === 'pdf' ? 'pdf' : 'png'}`;
}

export function outputPathArgIndex(command: string, args: readonly string[]): number | null {
  if (command === 'screenshot' || command === 'pdf') {
    return 0;
  }
  if (command === 'download') {
    return 1;
  }
  if (command === 'record' && args[0] === 'start') {
    return 1;
  }
  if (command === 'trace' && args[0] === 'stop') {
    return 1;
  }
  if (command === 'profiler' && args[0] === 'stop') {
    return 1;
  }
  if (command === 'network' && args[0] === 'har' && args[1] === 'stop') {
    return 2;
  }
  return null;
}

export function withArtifactPaths(
  command: string,
  args: readonly string[],
  dir: string,
  nowMs: number,
): string[] {
  const index = outputPathArgIndex(command, args);
  if (index === null) {
    return [...args];
  }
  const next = [...args];
  const current = next[index];
  if (current === undefined || current === '') {
    if (command === 'screenshot' || command === 'pdf') {
      next[index] = join(dir, defaultArtifactName(command, nowMs));
    }
    return next;
  }
  if (!isAbsolute(current)) {
    next[index] = join(dir, current);
  }
  return next;
}

export async function ensureArtifactDir(targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
}

export interface ArtifactEntry {
  path: string;
  mtimeMs: number;
}

export function expiredArtifactPaths(
  entries: readonly ArtifactEntry[],
  nowMs: number,
  ttlMs: number,
): string[] {
  return entries.filter((entry) => nowMs - entry.mtimeMs > ttlMs).map((entry) => entry.path);
}

export async function sweepBrowserArtifacts(
  dir: string,
  nowMs: number = Date.now(),
  ttlMs: number = BROWSER_ARTIFACT_TTL_MS,
): Promise<number> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const entries: ArtifactEntry[] = [];
  for (const name of names) {
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (info?.isFile()) {
      entries.push({ path, mtimeMs: info.mtimeMs });
    }
  }
  let removed = 0;
  for (const path of expiredArtifactPaths(entries, nowMs, ttlMs)) {
    const done = await unlink(path).then(
      () => true,
      () => false,
    );
    if (done) {
      removed += 1;
    }
  }
  return removed;
}
