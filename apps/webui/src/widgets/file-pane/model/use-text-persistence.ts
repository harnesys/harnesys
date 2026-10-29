import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useIdeStore } from '@/features/ide';
import { markProjectFileDirty } from '@/features/open-file';
import { writeProjectFileContent } from '@/shared/api/files';
import { gitFileStatusQueryKey, gitStatusQueryKey } from '@/shared/api/git';

export function scopedKey(path: string, worktreeId?: string): string {
  return worktreeId ? `${worktreeId}:${path}` : path;
}

export interface TextTarget {
  path: string;
  worktreeId?: string;
}

export function contentQueryKey(
  projectId: string,
  target: TextTarget,
): readonly [string, string, string, string] {
  return ['source-file-content', projectId, target.path, target.worktreeId ?? ''];
}

export function useTextPersistence(input: {
  projectId: string;
  setDrafts: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  draftsRef: { current: Record<string, string> };
}) {
  const { projectId, setDrafts, draftsRef } = input;
  const qc = useQueryClient();
  const savingRef = useRef<Set<string>>(new Set());

  const persistFile = useCallback(
    async (target: TextTarget, content: string) => {
      await writeProjectFileContent(projectId, {
        path: target.path,
        content,
        ...(target.worktreeId ? { worktreeId: target.worktreeId } : {}),
      });
      qc.setQueryData(contentQueryKey(projectId, target), content);
      setDrafts((prev) => ({ ...prev, [scopedKey(target.path, target.worktreeId)]: content }));
      if (!target.worktreeId) {
        markProjectFileDirty(projectId, target.path, false);
      }
      useIdeStore.getState().setFileDirty(projectId, target.path, false, target.worktreeId);
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
    },
    [projectId, qc, setDrafts],
  );

  const flushIfDirty = useCallback(
    async (target: TextTarget) => {
      const targetScope = scopedKey(target.path, target.worktreeId);
      if (savingRef.current.has(targetScope)) {
        return;
      }
      const draft = draftsRef.current[targetScope];
      if (draft === undefined) {
        return;
      }
      const serverText = qc.getQueryData<string>(contentQueryKey(projectId, target)) ?? '';
      if (draft === serverText) {
        return;
      }
      savingRef.current.add(targetScope);
      try {
        await persistFile(target, draft);
      } catch {
      } finally {
        savingRef.current.delete(targetScope);
      }
    },
    [projectId, qc, persistFile, draftsRef],
  );

  const saveMutation = useMutation({
    mutationFn: (saveInput: { path: string; content: string; worktreeId?: string }) =>
      writeProjectFileContent(projectId, saveInput),
    onSuccess: (_, saveInput) => {
      const target: TextTarget = {
        path: saveInput.path,
        ...(saveInput.worktreeId ? { worktreeId: saveInput.worktreeId } : {}),
      };
      qc.setQueryData(contentQueryKey(projectId, target), saveInput.content);
      setDrafts((prev) => ({
        ...prev,
        [scopedKey(target.path, target.worktreeId)]: saveInput.content,
      }));
      if (!target.worktreeId) {
        markProjectFileDirty(projectId, target.path, false);
      }
      useIdeStore.getState().setFileDirty(projectId, target.path, false, target.worktreeId);
      void qc.invalidateQueries({ queryKey: gitStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
      void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'file-status'] });
    },
  });

  const requestSave = useCallback(
    (target: TextTarget & { draft: string | undefined; dirty: boolean }) => {
      if (
        target.draft === undefined ||
        !target.dirty ||
        saveMutation.isPending ||
        savingRef.current.has(scopedKey(target.path, target.worktreeId))
      ) {
        return;
      }
      saveMutation.mutate({
        path: target.path,
        content: target.draft,
        ...(target.worktreeId ? { worktreeId: target.worktreeId } : {}),
      });
    },
    [saveMutation],
  );

  return { flushIfDirty, requestSave, savingRef };
}
