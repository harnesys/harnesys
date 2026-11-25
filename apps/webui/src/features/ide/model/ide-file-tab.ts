import { type FileRef, fileRefKey, fileRefPath, fileRefProjectId } from '@/features/open-file';
import type { IdeTab } from './ide.store';
import { tabIdFor } from './ide-tab-id';

export function fileTabId(target: FileRef, fallbackProjectId: string): string {
  return tabIdFor('file', fileRefProjectId(target, fallbackProjectId), fileRefKey(target));
}

export function fileTabFromTarget(
  target: FileRef,
  fallbackProjectId: string,
  dirty: boolean,
): IdeTab {
  const project = target.source === 'project' ? target : null;
  return {
    id: fileTabId(target, fallbackProjectId),
    kind: 'file',
    projectId: fileRefProjectId(target, fallbackProjectId),
    target,
    path: fileRefPath(target),
    dirty,
    ...(project?.worktreeId ? { worktreeId: project.worktreeId } : {}),
    ...(project?.worktreeBranch ? { worktreeBranch: project.worktreeBranch } : {}),
  };
}
