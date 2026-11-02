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

export function loginShellPath(shell: string | undefined): string | undefined {
  if (process.platform === 'win32' || !shell) {
    return undefined;
  }
  try {
    const result = Bun.spawnSync([shell, '-l', '-c', 'printf %s "$PATH"'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: LOGIN_SHELL_TIMEOUT_MS,
    });
    const text = result.stdout?.toString().trim();
    if (
      result.exitCode !== 0 ||
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
