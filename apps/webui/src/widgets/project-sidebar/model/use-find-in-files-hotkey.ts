import { useEffect } from 'react';
import { openFindInFilesDialog, openReplaceInFilesDialog } from '@/features/find-in-files';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { useFileSelectionStore } from './file-selection.store';

interface FindTarget {
  sourceId: string;
  dir?: string;
}

function isEditableFocus(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return false;
  }
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable;
}

function resolveTarget(focusProjectId: string | null): FindTarget | null {
  const store = useFileSelectionStore.getState();
  const selected = store.filesActive && store.scopeWorktreeId === null;
  const sourceId = selected ? store.projectId : focusProjectId;
  if (!sourceId) {
    return null;
  }
  const dir = selected && store.projectId === sourceId ? store.selectedDirPath : null;
  return { sourceId, ...(dir ? { dir } : {}) };
}

export function useFindInFilesHotkey() {
  const { focus } = useStudioLocation();
  const focusProjectId = studioFocusProjectId(focus);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) {
        return;
      }
      if (event.code !== 'KeyF' && event.code !== 'KeyR') {
        return;
      }
      if (isEditableFocus()) {
        return;
      }
      const target = resolveTarget(focusProjectId);
      if (!target) {
        return;
      }
      event.preventDefault();
      if (event.code === 'KeyF') {
        void openFindInFilesDialog(target);
        return;
      }
      void openReplaceInFilesDialog(target);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusProjectId]);
}
