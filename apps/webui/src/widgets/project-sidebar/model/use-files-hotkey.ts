import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useIdeStore } from '@/features/ide';
import { collapseToRoots } from '@/features/move-project-files';
import { deleteProjectFile, sourceFilesTreeQueryKey } from '@/shared/api/files';
import { gitFileStatusQueryKey, stageGit } from '@/shared/api/git';
import { toast } from '@/shared/ui/toast';
import { useFileSelectionStore } from './file-selection.store';

function isEditableFocus(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return false;
  }
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
}

export function useFilesHotkey(projectId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId) {
      return;
    }
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'status'] });
    };
    const runDelete = (paths: string[]) => {
      const roots = collapseToRoots(paths);
      if (roots.length === 0) {
        return;
      }
      for (const path of roots) {
        useIdeStore.getState().closeByEntity(projectId, 'file', path);
      }
      void Promise.all(roots.map((path) => deleteProjectFile(projectId, path)))
        .then(() => {
          invalidate();
          toast.add({ title: `Deleted ${roots.length}` });
        })
        .catch((err: unknown) => {
          invalidate();
          toast.add({
            title: 'Delete failed',
            description: err instanceof Error ? err.message : 'Unknown error',
          });
        });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableFocus()) {
        return;
      }
      const store = useFileSelectionStore.getState();
      if (!store.filesActive || store.projectId !== projectId || store.scopeWorktreeId) {
        return;
      }
      if (event.metaKey && event.altKey && event.code === 'KeyA') {
        event.preventDefault();
        const target = store.selectedPaths.length > 0 ? store.selectedPaths : [];
        void stageGit(projectId, target)
          .then(() => {
            invalidate();
            toast.add({ title: target.length === 0 ? 'Staged all' : `Staged ${target.length}` });
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Stage failed';
            toast.add({ title: 'Stage failed', description: msg });
          });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.code === 'Backspace') {
        event.preventDefault();
        runDelete(store.selectedPaths);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [projectId, qc]);
}
