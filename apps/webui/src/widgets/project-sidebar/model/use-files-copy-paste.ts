import type { ProjectFileEntry } from '@harnesys/studio-shared';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { buildMoveItems } from '@/features/move-project-files';
import {
  copyProjectFiles,
  importProjectFiles,
  projectEntryExists,
  sourceFilesTreeQueryKey,
  writeProjectFileBytes,
} from '@/shared/api/files';
import { gitFileStatusQueryKey } from '@/shared/api/git';
import { env } from '@/shared/config/env';
import { joinProjectPath, projectDirname } from '@/shared/lib/project-path.ts';
import { toast } from '@/shared/ui/toast';
import { useExplorerHiddenStore } from './explorer-hidden.store';
import { useFileSelectionStore } from './file-selection.store';
import { filesClipboard, setFilesClipboard } from './files-clipboard.store';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA']);

function isEditableFocus(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) {
    return false;
  }
  return EDITABLE_TAGS.has(active.tagName) || active.isContentEditable;
}

function pasteTargetDir(qc: QueryClient, projectId: string): string {
  const store = useFileSelectionStore.getState();
  const selected = store.selectedPaths;
  const focus = store.anchorPath ?? selected[selected.length - 1] ?? '';
  if (!focus) {
    return '';
  }
  const showHidden = useExplorerHiddenStore.getState().showHidden;
  const tree = qc.getQueryData<ProjectFileEntry[]>(sourceFilesTreeQueryKey(projectId, showHidden));
  const entry = tree?.find((row) => row.path === focus);
  if (!entry) {
    return projectDirname(focus);
  }
  return entry.kind === 'dir' ? focus : projectDirname(focus);
}

function invalidateAfterPaste(qc: QueryClient, projectId: string): void {
  void qc.invalidateQueries({ queryKey: sourceFilesTreeQueryKey(projectId) });
  void qc.invalidateQueries({ queryKey: gitFileStatusQueryKey(projectId) });
  void qc.invalidateQueries({ queryKey: ['projects', projectId, 'git', 'status'] });
}

function toastPasteError(err: unknown): void {
  toast.add({
    title: 'Paste failed',
    description: err instanceof Error ? err.message : 'Unknown error',
  });
}

function pasteInternalClipboard(qc: QueryClient, projectId: string, clipPaths: string[]): void {
  const dir = pasteTargetDir(qc, projectId);
  const items = buildMoveItems(clipPaths, dir);
  if (items.length === 0) {
    return;
  }
  copyProjectFiles(projectId, items)
    .then((result) => {
      invalidateAfterPaste(qc, projectId);
      toast.add({ title: `Pasted ${result.copied.length}` });
    })
    .catch(toastPasteError);
}

async function pasteboardPaths(): Promise<string[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<string[]>('pasteboard_paths');
  } catch {
    return [];
  }
}

function pasteFromPasteboard(qc: QueryClient, projectId: string): void {
  const dir = pasteTargetDir(qc, projectId);
  void pasteboardPaths().then((paths) => {
    if (paths.length === 0) {
      toast.add({ title: 'Clipboard has no files' });
      return;
    }
    const items = paths.map((fromAbs) => ({
      fromAbs,
      toRel: joinProjectPath(dir, fromAbs.split('/').pop() ?? fromAbs),
    }));
    importProjectFiles(projectId, items)
      .then((result) => {
        invalidateAfterPaste(qc, projectId);
        toast.add({ title: `Pasted ${result.imported.length}` });
      })
      .catch(toastPasteError);
  });
}

async function uploadPastedFiles(
  qc: QueryClient,
  projectId: string,
  files: File[],
  dir: string,
): Promise<void> {
  const skipped: string[] = [];
  let pasted = 0;
  for (const file of files) {
    const path = joinProjectPath(dir, file.name);
    if (await projectEntryExists(projectId, path)) {
      skipped.push(file.name);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await writeProjectFileBytes(projectId, { path, bytes });
    pasted += 1;
  }
  if (pasted > 0) {
    invalidateAfterPaste(qc, projectId);
    toast.add({ title: `Pasted ${pasted}` });
  }
  if (skipped.length > 0) {
    toast.add({ title: 'Already exists', description: skipped.join(', ') });
  }
}

function selectionAllowsClipboard(projectId: string): boolean {
  const store = useFileSelectionStore.getState();
  return store.filesActive && store.projectId === projectId && !store.scopeWorktreeId;
}

interface PastedEntry {
  isDirectory: boolean;
  name: string;
}

function entryOf(item: DataTransferItem): PastedEntry | null {
  const withEntry = item as DataTransferItem & {
    webkitGetAsEntry?: () => PastedEntry | null;
  };
  return withEntry.webkitGetAsEntry?.() ?? null;
}

function collectPastedItems(event: ClipboardEvent): { files: File[]; dirs: string[] } {
  const files: File[] = [];
  const dirs: string[] = [];
  for (const item of Array.from(event.clipboardData?.items ?? [])) {
    if (item.kind !== 'file') {
      continue;
    }
    const entry = entryOf(item);
    if (entry?.isDirectory) {
      dirs.push(entry.name);
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }
  return { files, dirs };
}

export function useFilesCopyPaste(projectId: string, qc: QueryClient): void {
  useEffect(() => {
    if (!projectId) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isEditableFocus()) {
        return;
      }
      if (!selectionAllowsClipboard(projectId)) {
        return;
      }
      if (event.code === 'KeyC') {
        const selected = useFileSelectionStore.getState().selectedPaths;
        if (selected.length > 0) {
          setFilesClipboard({ projectId, paths: [...selected] });
        }
        return;
      }
      if (event.code !== 'KeyV') {
        return;
      }
      const clip = filesClipboard();
      if (clip && clip.projectId === projectId) {
        event.preventDefault();
        pasteInternalClipboard(qc, projectId, clip.paths);
        return;
      }
      if (env.isTauri) {
        event.preventDefault();
        pasteFromPasteboard(qc, projectId);
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (env.isTauri || isEditableFocus() || !selectionAllowsClipboard(projectId)) {
        return;
      }
      const { files, dirs } = collectPastedItems(event);
      if (files.length === 0 && dirs.length === 0) {
        return;
      }
      event.preventDefault();
      if (dirs.length > 0) {
        toast.add({
          title: 'Folder paste works in the desktop app',
          description: `${dirs.join(', ')} - browsers cannot read folder contents from the system clipboard.`,
        });
      }
      if (files.length > 0) {
        const dir = pasteTargetDir(qc, projectId);
        void uploadPastedFiles(qc, projectId, files, dir).catch(toastPasteError);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [projectId, qc]);
}
