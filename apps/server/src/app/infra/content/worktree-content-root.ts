import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ContentNotFoundException } from '../../domain/content/content.error.ts';

export function assertSafeWorktreeId(worktreeId: string): void {
  if (
    !worktreeId ||
    worktreeId.includes('/') ||
    worktreeId.includes('\\') ||
    worktreeId.includes('\0') ||
    worktreeId === '.' ||
    worktreeId === '..'
  ) {
    throw new ContentNotFoundException(`worktree not found: ${worktreeId}`);
  }
}

export function resolveWorktreeContentRoot(worktreesDir: string, worktreeId: string): string {
  assertSafeWorktreeId(worktreeId);
  const root = join(worktreesDir, worktreeId);
  try {
    if (!(existsSync(root) && statSync(root).isDirectory())) {
      throw new ContentNotFoundException(`worktree not found: ${worktreeId}`);
    }
  } catch (err) {
    if (err instanceof ContentNotFoundException) {
      throw err;
    }
    throw new ContentNotFoundException(`worktree not found: ${worktreeId}`);
  }
  return root;
}
