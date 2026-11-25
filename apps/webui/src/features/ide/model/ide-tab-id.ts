import type { IdeTabKind } from './ide.store';

export function tabIdFor(kind: IdeTabKind, projectId: string, key: string): string {
  return `${kind}:${projectId}:${key}`;
}

export function normalizeIdeFilePath(path: string): string {
  return path.replace(/^\/+/, '');
}

export function fileTabKey(path: string, worktreeId?: string | null): string {
  const normalized = normalizeIdeFilePath(path);
  return worktreeId ? `wt:${worktreeId}:${normalized}` : normalized;
}
