import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useIdeStore } from '@/features/ide';
import { markProjectFileDirty } from '@/features/open-file';
import { writeProjectFileContent } from '@/shared/api/files';

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
    },
  });
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  const flushIfDirty = useCallback(
    async (target: TextTarget) => {
      const mutation = saveMutationRef.current;
      const targetScope = scopedKey(target.path, target.worktreeId);
      if (savingRef.current.has(targetScope) || mutation.isPending) {
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
        await mutation.mutateAsync({
          path: target.path,
          content: draft,
          ...(target.worktreeId ? { worktreeId: target.worktreeId } : {}),
        });
      } catch {
      } finally {
        savingRef.current.delete(targetScope);
      }
    },
    [projectId, qc, draftsRef],
  );

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
