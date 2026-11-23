import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

export const LOGIN_SHELL_TIMEOUT_MS = 8000;
const MAX_PATH_LENGTH = 8192;

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function expandHome(dir: string, home: string): string {
  if (dir === '~') {
    return home;
  }
  if (dir === `~${delimiter}` || dir.startsWith('~/')) {
    return join(home, dir.slice(2));
  }
  return dir;
}

export function splitPathEnv(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter((dir) => dir.length > 0);
}

export async function loginShellPath(shell: string | undefined): Promise<string | undefined> {
  if (process.platform === 'win32' || !shell) {
    return undefined;
  }
  try {
    const proc = Bun.spawn([shell, '-l', '-c', 'printf %s "$PATH"'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const timedOut = await exitsLaterThan(proc.exited, LOGIN_SHELL_TIMEOUT_MS);
    if (timedOut) {
      proc.kill();
      return undefined;
    }
    if (proc.exitCode !== 0) {
      return undefined;
    }
    const text = (await Bun.readableStreamToText(proc.stdout)).trim();
    if (
      !text ||
      text.includes('\n') ||
      !text.includes(delimiter) ||
      text.length > MAX_PATH_LENGTH
    ) {
      return undefined;
    }
    return text;
  } catch {
    return undefined;
  }
}

function exitsLaterThan(exited: Promise<number>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(true), ms);
  });
  return Promise.race([exited.then(() => false), timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
