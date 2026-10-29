import { join, resolve } from 'node:path';
import { GitOperationException } from './source.error.ts';

export interface GitRepositoryLayout {
  bareRepoPath: string;
  worktreesRoot: string;
}

export function gitWorktreePath(layout: GitRepositoryLayout, worktreeId: string): string {
  const trimmed = worktreeId.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new GitOperationException(`invalid worktree id: ${worktreeId}`);
  }
  return join(resolve(layout.worktreesRoot), trimmed);
}
