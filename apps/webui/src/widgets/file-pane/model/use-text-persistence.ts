import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { useIdeStore } from '@/features/ide';
import { type FileRef, textContentBackend } from '@/features/open-file';

export function useTextPersistence(input: {
  setDrafts: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  draftsRef: { current: Record<string, string> };
}) {
  const { setDrafts, draftsRef } = input;
  const qc = useQueryClient();
  const savingRef = useRef<Set<string>>(new Set());

  const saveMutation = useMutation({
    mutationFn: async (saveInput: { target: FileRef; content: string }) => {
      const backend = textContentBackend(saveInput.target);
      if (!backend) {
        throw new Error(`file ref is not writable: ${saveInput.target.source}`);
      }
      await backend.write(saveInput.content);
      return { target: saveInput.target, backend, content: saveInput.content };
    },
    onSuccess: ({ target, backend, content }) => {
      qc.setQueryData(backend.queryKey, content);
      setDrafts((prev) => ({ ...prev, [backend.key]: content }));
      useIdeStore.getState().setFileDirty(target, false);
    },
  });
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  const flushIfDirty = useCallback(
    async (target: FileRef) => {
      const mutation = saveMutationRef.current;
      const backend = textContentBackend(target);
      if (!backend || savingRef.current.has(backend.key) || mutation.isPending) {
        return;
      }
      const draft = draftsRef.current[backend.key];
      if (draft === undefined) {
        return;
      }
      const serverText = qc.getQueryData<string>(backend.queryKey) ?? '';
      if (draft === serverText) {
        return;
      }
      savingRef.current.add(backend.key);
      try {
        await mutation.mutateAsync({ target, content: draft });
      } catch {
      } finally {
        savingRef.current.delete(backend.key);
      }
    },
    [qc, draftsRef],
  );

  const requestSave = useCallback(
    (saveInput: { target: FileRef; draft: string | undefined; dirty: boolean }) => {
      const backend = textContentBackend(saveInput.target);
      if (
        !backend ||
        saveInput.draft === undefined ||
        !saveInput.dirty ||
        saveMutation.isPending ||
        savingRef.current.has(backend.key)
      ) {
        return;
      }
      saveMutation.mutate({ target: saveInput.target, content: saveInput.draft });
    },
    [saveMutation],
  );

  return { flushIfDirty, requestSave, savingRef };
}
