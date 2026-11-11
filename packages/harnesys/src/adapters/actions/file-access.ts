import { DEFAULT_PATH_BLOCKLIST } from '../../constants.ts';
import { firstBlockingPattern } from './path-blocklist.ts';
import { resolveWorkdirPath } from './path-resolve.ts';

export function resolveWorkspaceFilePath(root: string, target: string): string {
  const resolved = resolveWorkdirPath(root, target, root);
  const blocking = firstBlockingPattern(resolved, DEFAULT_PATH_BLOCKLIST);
  if (blocking !== undefined) {
    throw new Error(`Path is blocked (${blocking}): ${target}`);
  }
  return resolved;
}
